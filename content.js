const isDevelopment = true;
let exploration = {
    limit: 2,
    lastScrollY: 0,
    stylesheets: {
        exploredSheets: [],
        selectors: new Set(),
    }
};
let lastKnownScrollY = undefined;
let stickyFixer = null;
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

    onChange(scrollY, forceUpdate, shouldHide) {
        let stickies = exploredStickies.filter(s => s.status === 'fixed' && !typesToShow.includes(s.type));
        shouldHide = shouldHide !== undefined ? shouldHide : this.shouldHide(scrollY, this.hidden);
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
}

let fixers = {
    'hover': fixer => new StickyFixer(fixer,
        scrollY => scrollY / window.innerHeight > 0.1,
        (selectors, showStyles) =>
            [selectors.map(s => s + ':not(:hover)').join(',') + '{ opacity: 0; }', ...showStyles]),
    'scroll': fixer => new StickyFixer(fixer,
        (scrollY, hidden) => scrollY / window.innerHeight > 0.1 && scrollY === lastKnownScrollY ? hidden : scrollY > lastKnownScrollY,
        selectors =>
            [selectors.join(',') + `{ opacity: 0; visibility: hidden; animation: none; transition: opacity ${transDuration}s ease-in-out, visibility 0s ${transDuration}s; }`]),
    'top': fixer => new StickyFixer(fixer,
        scrollY => scrollY / window.innerHeight > 0.1,
        selectors =>
            [selectors.join(',') + `{ opacity: 0; visibility: hidden; animation: none; transition: opacity ${transDuration}s ease-in-out, visibility 0s ${transDuration}s; }`])
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

let skipEvent = (isReady, obj, event, action) => isReady ? action() : obj.addEventListener(event, action, false);

function updateBehavior(behavior) {
    log(behavior);
    behavior = behavior || (DetectIt.deviceType === 'mouseonly' ? 'hover' : 'scroll');
    let isActive = stickyFixer !== null;
    let scrollCandidates = [window, document.body];
    if (behavior !== 'always') {
        stickyFixer = fixers[behavior](stickyFixer);
        skipEvent(document.readyState === 'complete', window, 'load', () => {
            // Run several times waiting for JS on the page to do all changes
            [0, 500, 1000, 2000].forEach(t => setTimeout(() => doAll(true, false), t));
        });
        document.readyState === 'complete' && doAll(true, true);
        !isActive && scrollCandidates.forEach(target => target.addEventListener('scroll', scrollListener, DetectIt.passiveEvents && {passive: true}));
    } else if (isActive && behavior === 'always') {
        scrollCandidates.forEach(target => target.removeEventListener('scroll', scrollListener));
        stickyFixer.stylesheet && stickyFixer.stylesheet.ownerNode.remove();
        stickyFixer = null;
    }
}

// This liberal comparison picks up "FiXeD !important" or "-webkit-sticky" positions
let isFixedPos = p => p.toLowerCase().indexOf('fixed') >= 0 || p.toLowerCase().indexOf('sticky') >= 0;
let highSpecificitySelector = el => {
    // there is always the unique selector since we use nthchild.
    let {selectors, element} = selectorGenerator.getSelectorObjects(el);
    // Boosting with id within the selector, id of its parents, then class within the selector
    let boosted = selectors.find(s => s.id && (s.id = s.id + s.id));
    let booster = '';
    if (!boosted) {
        let isDirectParent = true;
        for (let el = element.parentElement; el && !booster; el = el.parentElement, isDirectParent = false) {
            let sel = selectorGenerator.getIdSelector(el);
            sel && (booster = sel + (isDirectParent ? ' > ' : ' '));
        }
        boosted = !!booster;
    }
    if (!boosted) {
        let combos = null;
        selectors.find(s => combos = s.class || s.attribute);
        combos && combos.push(...combos);
    }
    return booster + selectors.map(sel => selectorGenerator.stringifySelectorObject(sel)).join(' > ');
};

function explore(asyncCallback) {
    let makeStickyObj = el => ({
        el: el,
        type: classify(el, el.getBoundingClientRect()),
        selector: highSpecificitySelector(el),
        status: isFixedPos(window.getComputedStyle(el).position) ? 'fixed' : 'unfixed'
    });
    let exploreSelectors = () => {
        let selector = [...exploration.stylesheets.selectors, '*[style*="fixed" i]', '*[style*="sticky" i]'].join(',');
        let newStickies = _.difference(document.body.querySelectorAll(selector), _.pluck(exploredStickies, 'el')).map(makeStickyObj);
        newStickies.length && exploredStickies.push(...newStickies);
        log("exploredStickies", exploredStickies);
        return newStickies;
    };
    let exploreStylesheets = () => {
        let sheets = exploration.stylesheets;
        let asyncStylesheets = [];
        if (sheets.exploredSheets.length === document.styleSheets.length
            && _.last(sheets.exploredSheets) === _.last(document.styleSheets)) {
            return;
        }

        let exploreStylesheet = sheet => {
            if (sheets.exploredSheets.includes(sheet)) return;
            sheets.exploredSheets.push(sheet);
            let cssRules = null;
            try {
                cssRules = sheet.cssRules;
            } catch (e) {
            }
            let exploreRules = rules => _.forEach(rules, rule => {
                if (rule.type === CSSRule.STYLE_RULE && isFixedPos(rule.style.position)) {
                    sheets.selectors.add(rule.selectorText);
                } else if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
                    exploreRules(rule.cssRules);
                } else if (rule.type === CSSRule.IMPORT_RULE) {
                    exploreStylesheet(rule.styleSheet);
                }
            });
            if (cssRules !== null) {
                exploreRules(cssRules);
            } else if (sheet.href) {  // Bypass the CORS restrictions
                // TODO: This may cause extra requests. Look into 'only-if-cached' and
                // handle the cases when the stylesheet is already being downloaded for the page.
                asyncStylesheets.push(fetch(sheet.href, {method: 'GET', cache: 'force-cache'})
                    .then(response => response.ok ? response.text() : Promise.reject('Bad response'))
                    .then(text => {
                        let iframe = document.createElement('iframe');
                        iframe.style.display = 'none';  // Isolate stylesheet to prevent reflow
                        document.body.appendChild(iframe);
                        let iframeDoc = iframe.contentDocument;
                        let base = sheet.href.trim().toLowerCase().indexOf('data:') === 0 ? sheet.ownerNode.baseURI : sheet.href;
                        base && (iframeDoc.head.appendChild(iframeDoc.createElement('base')).href = base);  // For @import
                        let style = iframeDoc.head.appendChild(iframeDoc.createElement('style'));
                        style.textContent = text;
                        exploreRules(style.sheet.cssRules);
                        iframe.remove();
                    })
                    .catch(err => log(`Error downloading stylesheet ${sheet.href}: ${err}`)));
            }
        };
        _.forEach(document.styleSheets, exploreStylesheet);
        return asyncStylesheets.length && Promise.all(asyncStylesheets);
    };
    let async = exploreStylesheets();
    async && async.then(exploreSelectors).then(asyncCallback);
    return exploreSelectors();
}

function doAll(forceExplore, forceUpdate) {
    // Do nothing unless scrolled by about 5%
    let scrollY = window.scrollY || document.body.scrollTop;
    if (!forceExplore && !forceUpdate && Math.abs(lastKnownScrollY - scrollY) / window.innerHeight < 0.05) {
        return;
    }
    let reviewSticky = s => {
        // An element may be moved elsewhere, removed and returned to DOM later. It tries to recover them by selector.
        let els = s.selector && document.querySelectorAll(s.selector);
        let isUnique = els && els.length === 1;
        let isInDOM = document.body.contains(s.el);
        let update = (key, value) => {
            if (s[key] !== value) {
                forceUpdate = true;
                log(`Updated ${key} to ${value}`, s);
                s[key] = value;
            }
        };
        isInDOM && !isUnique && update('selector', highSpecificitySelector(s.el));
        !isInDOM && isUnique && (s.el = els[0]); // Does not affect stylesheet, so no update
        // The dimensions are unknown until it's shown
        s.type === 'hidden' && update('type', classify(s.el, s.el.getBoundingClientRect()));
        update('status', !isInDOM && !isUnique ? 'removed' :
            (isFixedPos(window.getComputedStyle(s.el).position) ? 'fixed' : 'unfixed'));
    };
    measure('reviewStickies', () => exploredStickies.forEach(reviewSticky));
    // Explore if scrolled far enough from the last explored place. Explore once again a bit closer.
    let threshold = exploration.lastScrollY < window.innerHeight ? 0.25 : 0.5;
    let isFar = Math.abs(exploration.lastScrollY - scrollY) / window.innerHeight > threshold;
    if (isFar || exploration.limit > 0 || forceExplore) {
        let newStickies = measure('explore', () => explore(newStickies => newStickies.length && stickyFixer && stickyFixer.onChange(scrollY, true, stickyFixer.hidden)));
        forceUpdate |= newStickies.length > 0;
        isFar ? ((exploration.limit = 1) && (exploration.lastScrollY = scrollY)) : exploration.limit--;
    }
    stickyFixer.onChange(scrollY, forceUpdate);
    lastKnownScrollY = scrollY;
}

chrome.storage.local.get('behavior', response => skipEvent(document.readyState !== 'loading', document, 'DOMContentLoaded', () => updateBehavior(response.behavior)));
chrome.storage.onChanged.addListener(changes => updateBehavior(changes.behavior.newValue));