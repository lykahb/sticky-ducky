const isDevelopment = true;
let exploration = {
    // Exploring elements is costly. After some scrolling around, it can be stopped
    limit: 10,
    stylesheets: {
        exploredSheets: [],
        selectors: [],
        processedCounter: 0
    }
};
let lastKnownScrollY = 0;
let exploredStickies = [];
let scrollListener = _.throttle(() => doAll(), 300);
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

    updateStylesheetOnScroll(stickies, forceUpdate) {
        let shouldHide = this.shouldHide();
        if (forceUpdate || stickies.length && shouldHide !== this.hidden) {
            let selectors = stickies.map(s => s.selector);
            let showStyles = [_.pluck(stickies, 'selector').join(',') + `{ transition: opacity ${transDuration}s ease-in-out;}`];
            let css = !stickies.length ? []
                : (shouldHide ? this.hideStyles(selectors, showStyles) : showStyles);
            this.updateStylesheet(css);
            this.hidden = shouldHide;
        }
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

    updateFixerOnScroll(stickies, forceUpdate) {
        let toFix = stickies.filter(s => s.status === 'fixed' && !typesToShow.includes(s.type));
        this.updateStylesheetOnScroll(toFix, forceUpdate);
    }

    destroy() {
        this.stylesheet && this.stylesheet.ownerNode.remove();
    }
}

let hoverFixer = (fixer) => new StickyFixer(fixer,
    () => window.scrollY / window.innerHeight > 0.1,
    (selectors, showStyles) =>
        [selectors.map(s => s + ':not(:hover)').join(',') + '{ opacity: 0; }'].concat(showStyles));
let scrollFixer = (fixer) => new StickyFixer(fixer,
    () => window.scrollY / window.innerHeight > 0.1 && window.scrollY >= lastKnownScrollY,
    selectors =>
        [selectors.join(',') + `{ opacity: 0; visibility: hidden; animation: none; transition: opacity ${transDuration}s ease-in-out, visibility 0s ${transDuration}s; }`]);
let topFixer = (fixer) => new StickyFixer(fixer,
    () => window.scrollY / window.innerHeight > 0.1,
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

// This liberal comparison picks up "FiXeD !important" or "-webkit-sticky" positions
let isFixedPos = p => p.toLowerCase().indexOf('fixed') >= 0 || p.toLowerCase().indexOf('sticky') >= 0;

function explore(stickies) {
    let newStickies = [];
    let allEls = _.pluck(stickies, 'el');
    let makeStickyObj = el => {
        return {
            el: el,
            type: classify(el, el.getBoundingClientRect()),
            selector: selectorGenerator.getSelector(el),
            status: 'fixed'
        };
    };
    let addExploredEls = els => {
        els = _.difference(els, allEls);
        if (!els.length) return;
        allEls = allEls.concat(els);
        newStickies = newStickies.concat(els.map(makeStickyObj));
    };
    let exploreSelectors = () => {
        let selector = exploration.stylesheets.selectors.concat(['*[style*="fixed" i]', '*[style*="sticky" i]']).join(',');
        addExploredEls(_.filter(document.body.querySelectorAll(selector), el => isFixedPos(window.getComputedStyle(el).position)));
    };
    let exploreStylesheets = () => {
        let sheets = exploration.stylesheets;
        if (sheets.exploredSheets.length === document.styleSheets.length
            && _.last(sheets.exploredSheets) === _.last(document.styleSheets)) {
            return;
        }
        _.forEach(document.styleSheets, sheet => {
            if (sheets.exploredSheets.includes(sheet)) return;
            let cssRules = null;
            try {
                cssRules = sheet.cssRules;
            } catch (e) {
            }
            let exploreRules = cssRules => {
                let traverseRules = rules => _.forEach(rules, rule => {
                    if (rule.type === CSSRule.STYLE_RULE && isFixedPos(rule.style.position)) {
                        sheets.selectors.push(rule.selectorText);
                    } else if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
                        traverseRules(rule.cssRules);
                    }
                });
                traverseRules(cssRules);
                // Make the selectors unique once all stylesheets are processed
                ++sheets.processedCounter >= document.styleSheets.length && (sheets.selectors = _.uniq(sheets.selectors));
            };
            if (cssRules !== null) {
                exploreRules(cssRules);
            } else if (sheet.href) {  // Bypass the CORS restrictions
                // TODO: This may cause extra requests. Look into 'only-if-cached' and
                // handle the cases when the stylesheet is already being downloaded for the page.
                fetch(sheet.href, {method: 'GET', cache: 'force-cache'})
                    .then(response => response.ok ? response.text() : Promise.reject('Bad response'))
                    .then(text => {
                        let style = document.head.appendChild(document.createElement('style'));
                        style.media = 'print';  // To prevent reflow
                        style.innerHTML = text;
                        exploreRules(style.sheet.cssRules);
                        style.remove();
                    })
                    .catch(err => log(`Error downloading stylesheet ${sheet.href}: ${err}`));
            }
            sheets.exploredSheets.push(sheet);
        });
    };
    measure('exploreStylesheets', exploreStylesheets);
    measure('exploreSelectors', exploreSelectors);
    return newStickies;
}

function doAll(forceUpdate) {
    // Do nothing unless scrolled by about 5%
    if (!forceUpdate && Math.abs(lastKnownScrollY - window.scrollY) / window.innerHeight < 0.05) {
        return;
    }
    let newStickies = [];
    if (exploration.limit) {
        newStickies = explore(exploredStickies);
        exploredStickies = exploredStickies.concat(newStickies);
        log("exploredStickies", exploredStickies);
        if (window.scrollY > window.innerHeight) {
            log(`decrement ${exploration.limit}`);
            exploration.limit--;
        }
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
    stickyFixer.updateFixerOnScroll(exploredStickies, forceUpdate || newStickies.length > 0);
    lastKnownScrollY = window.scrollY;
}

function updateBehavior(behavior, isInit) {
    log(behavior);
    let isActive = stickyFixer !== null;
    if (behavior !== 'always') {
        stickyFixer = fixers[behavior](stickyFixer);
        isInit && document.addEventListener('DOMContentLoaded', () => doAll(), false);
        isInit && document.addEventListener('load', () => doAll(), false);
        !isInit && doAll(true);
        !isActive && window.addEventListener("scroll", scrollListener, Modernizr.passiveeventlisteners ? {passive: true} : false);
    } else if (isActive && behavior === 'always') {
        window.removeEventListener('scroll', scrollListener);
        stickyFixer.destroy();
        stickyFixer = null;
    }
}

chrome.storage.local.get('behavior', response => updateBehavior(response.behavior, true));
chrome.storage.onChanged.addListener(changes => updateBehavior(changes.behavior.newValue));