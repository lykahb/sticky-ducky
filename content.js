const isDevelopment = true;
let exploration = {
    // Exploring elements is costly. After some scrolling around, it can be stopped
    limit: 10,
    stylesheets: {
        exploredSheets: [],
        selectors: new Set(),
    }
};
let scroller = undefined;
let lastKnownScrollY = undefined;
let exploredStickies = [];
let scrollListener = _.debounce(_.throttle(() => doAll(), 300), 1); // Debounce delay makes it run after the page scroll listeners
let transDuration = 0.2;
let typesToShow = ['sidebar', 'splash', 'hidden'];
let selectorGenerator = new CssSelectorGenerator();

class StickyFixer {
    constructor(fixer, shouldHide, hideStyles) {
        this.stylesheet = fixer ? fixer.stylesheet : null;
        this.hidden = fixer ? fixer.hidden : false;
        this.shouldHide = shouldHide;
        this.hideStyles = hideStyles;
    }

    onChange(stickies, forceUpdate, shouldHide) {
        stickies = stickies.filter(s => s.status === 'fixed' && !typesToShow.includes(s.type));
        shouldHide = shouldHide !== undefined ? shouldHide : this.shouldHide(this.hidden);
        if (forceUpdate || stickies.length && shouldHide !== this.hidden) {
            let selectors = stickies.map(s => s.selector);
            let showStyles = [_.pluck(stickies, 'selector').join(',') + `{ transition: opacity ${transDuration}s ease-in-out;}`];
            let css = !stickies.length ? []
                : (shouldHide ? this.hideStyles(selectors, showStyles) : showStyles);
            this.updateStylesheet(css);
        }
        this.hidden = shouldHide;
    }

    // Opacity is the best way to fix the headers. Removing the fixed position breaks some layouts
    // In case the header has animation keyframes involving opacity, set animation to none
    updateStylesheet(rules) {
        if (!this.stylesheet) {
            let style = document.head.appendChild(document.createElement('style'));
            style.type = 'text/css';
            this.stylesheet = style.sheet;
        }
        _.map(this.stylesheet.cssRules, () => this.stylesheet.deleteRule(0));
        let makeImportant = rule => rule.replace(/;/g, ' !important;');
        rules.map(makeImportant).forEach((rule, i) => this.stylesheet.insertRule(rule, i));
    }

    destroy() {
        this.stylesheet && this.stylesheet.ownerNode.remove();
    }
}

let hoverFixer = (fixer) => new StickyFixer(fixer,
    () => getScrollY() / window.innerHeight > 0.1,
    (selectors, showStyles) =>
        [selectors.map(s => s + ':not(:hover)').join(',') + '{ opacity: 0; }'].concat(showStyles));
let scrollFixer = (fixer) => new StickyFixer(fixer,
    hidden => getScrollY() / window.innerHeight > 0.1 && getScrollY() === lastKnownScrollY ? hidden : getScrollY() > lastKnownScrollY,
    selectors =>
        [selectors.join(',') + `{ opacity: 0; visibility: hidden; animation: none; transition: opacity ${transDuration}s ease-in-out, visibility 0s ${transDuration}s; }`]);
let topFixer = (fixer) => new StickyFixer(fixer,
    () => getScrollY() / window.innerHeight > 0.1,
    selectors =>
        [selectors.join(',') + `{ opacity: 0; visibility: hidden; animation: none; transition: opacity ${transDuration}s ease-in-out, visibility 0s ${transDuration}s; }`]);

let stickyFixer = null;
let fixers = {
    'hover': hoverFixer,
    'scroll': scrollFixer,
    'top': topFixer
};

let log = (...args) => isDevelopment && console.log("remove headers: ", ...args);
let measure = (label, f) => {
    if (!isDevelopment) return f();
    let before = window.performance.now();
    let result = f();
    let after = window.performance.now();
    log(`Call to ${label} took ${after - before}ms`);
    return result;
};

function classify(el, rect) {
    // TODO: take overflow into account. Use scrollHeight and offsetHeight
    let width = window.innerWidth,
        height = window.innerHeight,
        isWide = rect.width / width > 0.35,
        isThin = rect.height / height < 0.25,
        isTall = rect.height / height > 0.5,
        isOnTop = rect.top / height < 0.1,
        isOnBottom = rect.bottom / height > 0.9,
        isOnSide = rect.left / width < 0.1 || rect.right / width > 0.9;
    return isWide && isThin && isOnTop && 'header'
        || isWide && isThin && isOnBottom && 'footer'
        || isWide && isTall && 'splash'
        || isTall && isOnSide && 'sidebar'
        || el.scrollHeight === 0 && el.scrollWidth === 0 && 'hidden'
        || 'widget';
}

function updateBehavior(behavior, isInit) {
    log(behavior);
    let isActive = stickyFixer !== null;
    let findScroller = () => {
        let onFirstScroll = e => {
            scroller = e.currentTarget;
            scroller.addEventListener('scroll', scrollListener, DetectIt.passiveEvents && {passive: true});
            scrollListener(e);
            e.currentTarget.removeEventListener('scroll', onFirstScroll);
        };
        window.addEventListener('scroll', onFirstScroll);
        document.body.addEventListener('scroll', onFirstScroll);
    };
    if (behavior !== 'always') {
        stickyFixer = fixers[behavior](stickyFixer);
        isInit && window.addEventListener('load', () => {
            // Run several times waiting for JS on the page to do all changes
            [0, 500, 1000, 2000].forEach(t => setTimeout(() => doAll(true, false), t));
        }, false);
        !isInit && doAll(false, true);
        !isActive && scroller && scroller.addEventListener('scroll', scrollListener, DetectIt.passiveEvents && {passive: true});
        !isActive && findScroller();
    } else if (isActive && behavior === 'always') {
        scroller && scroller.removeEventListener('scroll', scrollListener);
        stickyFixer.destroy();
        stickyFixer = null;
    }
}

// This liberal comparison picks up "FiXeD !important" or "-webkit-sticky" positions
let isFixedPos = p => p.toLowerCase().indexOf('fixed') >= 0 || p.toLowerCase().indexOf('sticky') >= 0;

function explore() {
    let makeStickyObj = el => {
        return {
            el: el,
            type: classify(el, el.getBoundingClientRect()),
            selector: selectorGenerator.getSelector(el),
            status: 'fixed'
        };
    };
    let exploreSelectors = () => {
        let selector = [...exploration.stylesheets.selectors].concat(['*[style*="fixed" i]', '*[style*="sticky" i]']).join(',');
        let els = _.filter(document.body.querySelectorAll(selector), el => isFixedPos(window.getComputedStyle(el).position));
        return _.difference(els, _.pluck(exploredStickies, 'el')).map(makeStickyObj);
    };
    let exploreStylesheets = () => {
        let sheets = exploration.stylesheets;
        if (sheets.exploredSheets.length === document.styleSheets.length
            && _.last(sheets.exploredSheets) === _.last(document.styleSheets)) {
            return Promise.resolve();
        }
        let asyncStylesheets = [];

        let exploreStylesheet = sheet => {
            if (sheets.exploredSheets.includes(sheet)) return;
            sheets.exploredSheets.push(sheet);
            let cssRules = null;
            try {
                cssRules = sheet.cssRules;
            } catch (e) {
            }
            let exploreRules = cssRules => {
                let traverseRules = rules => _.forEach(rules, rule => {
                    if (rule.type === CSSRule.STYLE_RULE && isFixedPos(rule.style.position)) {
                        sheets.selectors.add(rule.selectorText);
                    } else if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
                        traverseRules(rule.cssRules);
                    } else if (rule.type === CSSRule.IMPORT_RULE) {
                        exploreStylesheet(rule.styleSheet);
                    }
                });
                traverseRules(cssRules);
            };
            if (cssRules !== null) {
                exploreRules(cssRules);
            } else if (sheet.href) {  // Bypass the CORS restrictions
                // TODO: This may cause extra requests. Look into 'only-if-cached' and
                // handle the cases when the stylesheet is already being downloaded for the page.
                asyncStylesheets.push(fetch(sheet.href, {method: 'GET', cache: 'force-cache'})
                    .then(response => response.ok ? response.text() : Promise.reject('Bad response'))
                    .then(text => {
                        let iframe = document.createElement('iframe');  // To prevent reflow
                        iframe.style.display = 'none';
                        document.body.appendChild(iframe);
                        let style = iframe.contentDocument.head.appendChild(document.createElement('style'));
                        style.textContent = text;
                        exploreRules(style.sheet.cssRules);
                        iframe.remove();
                    })
                    .catch(err => log(`Error downloading stylesheet ${sheet.href}: ${err}`)));
            }
        };
        _.forEach(document.styleSheets, exploreStylesheet);
        return Promise.all(asyncStylesheets);
    };
    return exploreStylesheets().then(exploreSelectors);
}

let getScrollY = () => scroller === undefined && 1
    || scroller.pageYOffset !== undefined && scroller.pageYOffset
    || scroller.scrollTop !== undefined && scroller.scrollTop;

function doAll(forceExplore, forceUpdate) {
    // Do nothing unless scrolled by about 5%
    let scrollY = getScrollY();
    if (!forceExplore && !forceUpdate && Math.abs(lastKnownScrollY - scrollY) / window.innerHeight < 0.05 || !document.body) {
        return;
    }
    let reviewStickies = () => exploredStickies.forEach(s => {
        // An element may be moved elsewhere, removed and returned to DOM later. It tries to recover them by selector.
        let els = document.querySelectorAll(s.selector);
        let isUnique = els.length === 1;
        let isInDOM = document.body.contains(s.el);
        let update = (key, value) => {
            if (s[key] !== value) {
                s[key] = value;
                forceUpdate = true;
            }
        };
        isInDOM && !isUnique && update('selector', selectorGenerator.getSelector(s.el));
        !isInDOM && isUnique && (s.el = els[0]);
        // The dimensions are unknown until it's shown
        s.type === 'hidden' && update('type', classify(s.el, s.el.getBoundingClientRect()));
        let newStatus = !isInDOM && !isUnique ? 'removed' :
            (isFixedPos(window.getComputedStyle(s.el).position) ? 'fixed' : 'unfixed');
        update('status', newStatus);
    });
    measure('reviewStickies', reviewStickies);

    let onChangeRan = false;
    if (exploration.limit) {
        explore().then(newStickies => {
            exploredStickies = exploredStickies.concat(newStickies);
            log("exploredStickies", exploredStickies);
            !onChangeRan && stickyFixer.onChange(exploredStickies, forceUpdate || newStickies.length > 0);
            onChangeRan && newStickies.length > 0 && stickyFixer.onChange(exploredStickies, true, stickyFixer.hidden);
            onChangeRan = true;
        });
        if (scrollY > window.innerHeight) {
            log(`decrement ${exploration.limit}`);
            exploration.limit--;
        }
    }
    !onChangeRan && stickyFixer.onChange(exploredStickies, forceUpdate);
    onChangeRan = true;
    lastKnownScrollY = scrollY;
}

document.addEventListener('DOMContentLoaded', () => chrome.storage.local.get('behavior', response => updateBehavior(response.behavior, true)));
chrome.storage.onChanged.addListener(changes => updateBehavior(changes.behavior.newValue));