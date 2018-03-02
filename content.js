let isDevelopment = false;
let exploration = {
    limit: 2,  // Limit for exploration on shorter scroll distance
    lastScrollY: 0,  // Keeps track of the scroll position during the last exploration
    sheets: [],  // Top level stylesheets along with metadata
    sheetSet: new Set(),  // Top level stylesheets
    selectors: new Set()  // Selectors for the rules that make element sticky
};
let lastKnownScrollY = undefined;
let stickyFixer = null;
let currentBehavior = null;
let exploredStickies = [];
let scrollListener = _.debounce(_.throttle(() => doAll(), 300), 1);  // Debounce delay makes it run after the page scroll listeners
let transDuration = 0.2;
let typesToShow = ['sidebar', 'splash', 'hidden'];  // Dimensions of a hidden element are unknown
let selectorGenerator = new CssSelectorGenerator();

class StickyFixer {
    constructor(fixer, getNewState, hideStyles) {
        this.stylesheet = fixer ? fixer.stylesheet : null;
        this.state = fixer ? fixer.state : 'show'; // hide, show, showFooters
        this.getNewState = getNewState;
        this.hideStyles = hideStyles;
    }

    onChange(scrollY, forceUpdate, keepState) {
        let stickies = exploredStickies.filter(s => s.status === 'fixed' && !typesToShow.includes(s.type));
        let input = {
            scrollY: scrollY,
            oldState: this.state,
            isOnTop: scrollY / window.innerHeight < 0.1,
            isOnBottom: (getDocumentHeight() - window.scrollY) / window.innerHeight < 1.3
        };
        input.defaultState = input.isOnTop && 'show' || input.isOnBottom && 'showFooters' || 'hide';
        let newState = keepState ? this.state : this.getNewState(input);
        if (forceUpdate || newState !== this.state) {
            let allSels = stickies.map(s => s.selector),
                rules = [];
            if (stickies.length) {
                rules.push(allSels.join(',') + `{ transition: opacity ${transDuration}s ease-in-out; }`);  // Show style
                let whatToHide = newState === 'hide' && allSels
                    || newState === 'showFooters' && stickies.filter(s => s.type !== 'footer').map(s => s.selector)
                    || [];
                whatToHide.length && rules.push(this.hideStyles(whatToHide));
            }
            this.updateStylesheet(rules);
            this.state = newState;
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
}

let fixers = {
    'hover': fixer => new StickyFixer(fixer,
        ({defaultState}) => defaultState,
        selectors => selectors.map(s => s + ':not(:hover)').join(',') + '{ opacity: 0; animation: none; }'),
    'scroll': fixer => new StickyFixer(fixer,
        ({defaultState, scrollY, oldState}) => scrollY === lastKnownScrollY && oldState
            || scrollY < lastKnownScrollY && 'show' || defaultState,
        selectors =>
            selectors.join(',') + `{ opacity: 0; visibility: hidden; transition: opacity ${transDuration}s ease-in-out, visibility 0s ${transDuration}s; animation: none; }`),
    'top': fixer => new StickyFixer(fixer,
        ({defaultState}) => defaultState,
        selectors =>
            selectors.join(',') + `{ opacity: 0; visibility: hidden; transition: opacity ${transDuration}s ease-in-out, visibility 0s ${transDuration}s; animation: none; }`)
};

function getDocumentHeight() {
    // http://james.padolsey.com/javascript/get-document-height-cross-browser/
    let body = document.body, html = document.documentElement;
    return Math.max(
        body.scrollHeight, body.offsetHeight, body.clientHeight,
        html.scrollHeight, html.offsetHeight, html.clientHeight);
}

let log = (...args) => isDevelopment && console.log("Sticky Ducky: ", ...args);
let measure = (label, f) => {
    if (!isDevelopment) return f();
    let before = window.performance.now();
    let result = f();
    let after = window.performance.now();
    log(`Call to ${label} took ${after - before}ms`);
    return result;
};

function classify(el) {
    let viewportWidth = window.innerWidth,
        viewportHeight = window.innerHeight,
        rect = el.getBoundingClientRect(),
        clip = (val, low, high, max) => Math.max(0, val + Math.min(low, 0) + Math.min(max - high, 0)),
        width = clip(rect.width || el.scrollWidth, rect.left, rect.right, viewportWidth),
        height = clip(rect.height || el.scrollHeight, rect.top, rect.bottom, viewportHeight),
        isWide = width / viewportWidth > 0.35,
        isThin = height / viewportHeight < 0.25,
        isTall = height / viewportHeight > 0.5,
        isOnTop = rect.top / viewportHeight < 0.1,
        isOnBottom = rect.bottom / viewportHeight > 0.9,
        isOnSide = rect.left / viewportWidth < 0.1 || rect.right / viewportWidth > 0.9;
    return isWide && isThin && isOnTop && 'header'
        || isWide && isThin && isOnBottom && 'footer'
        || isWide && isTall && 'splash'
        || isTall && isOnSide && 'sidebar'
        || width === 0 && height === 0 && 'hidden'
        || 'widget';
}

function activateBehavior() {
    log(`Activating behavior ${currentBehavior}`);
    let isActive = !!stickyFixer;  // Presence of stickyFixer indicates that the scroll listener is set
    let scrollCandidates = [window, document.body];
    if (currentBehavior !== 'always') {
        // Detecting passive events on Firefox and setting the listener immediately is buggy. Manifest supports only browsers that have it.
        !isActive && scrollCandidates.forEach(target => target.addEventListener('scroll', scrollListener, {passive: true}));
        stickyFixer = fixers[currentBehavior](stickyFixer);
        doAll(true, true);
    } else if (isActive && currentBehavior === 'always') {
        scrollCandidates.forEach(target => target.removeEventListener('scroll', scrollListener));
        stickyFixer.stylesheet && stickyFixer.stylesheet.ownerNode.remove();
        stickyFixer = null;
    }
}

function updateBehavior(behavior) {
    currentBehavior = behavior;
    if (document.readyState !== 'loading') activateBehavior();
}

// This liberal comparison picks up "FiXeD !important" or "-webkit-sticky" positions
let isFixedPos = p => p.toLowerCase().indexOf('fixed') >= 0 || p.toLowerCase().indexOf('sticky') >= 0;
let highSpecificitySelector = el => {
    // there is always the unique selector since we use nthchild.
    let {selectors, element} = selectorGenerator.getSelectorObjects(el);
    let idWithinSelector = () => selectors.find(s => s.id && (s.id = s.id + s.id));
    let ascendantId = () => {
        let directParent = element.parentElement;
        for (let el = directParent; el; el = el.parentElement) {
            let sel = selectorGenerator.getIdSelector(el);
            if (sel) return sel + (el === directParent ? ' > ' : ' ');
        }
    };
    let classesWithinSelector = () => {
        let list = null;
        selectors.find(s => list = s.class || s.attribute) && list.push(...list);
    };
    let booster = '';
    idWithinSelector() || (booster = ascendantId() || '') || classesWithinSelector();
    return booster + selectors.map(sel => selectorGenerator.stringifySelectorObject(sel)).join(' > ');
};

function explore(asyncCallback) {
    let makeStickyObj = el => ({
        el: el,
        type: classify(el),
        selector: highSpecificitySelector(el),
        status: isFixedPos(window.getComputedStyle(el).position) ? 'fixed' : 'unfixed'
    });
    let exploreSelectors = () => {
        let selector = [...exploration.selectors, '*[style*="fixed" i]', '*[style*="sticky" i]'].join(',');
        let newStickies = _.difference(document.querySelectorAll(selector), _.pluck(exploredStickies, 'el')).map(makeStickyObj);
        newStickies.length && exploredStickies.push(...newStickies);
        log("exploredStickies", exploredStickies);
        return newStickies;
    };
    let exploreStylesheets = () => {
        let asyncStylesheets = [];

        let exploreStylesheet = sheetInfo => {
            let sheet = sheetInfo.sheet;
            let cssRules = null;
            try {
                cssRules = sheet.cssRules;
            } catch (e) {
            }
            // Compare by href to prevent multiple fetching if several links have the same href

            let exploreRules = rules => _.forEach(rules, rule => {
                if (rule.type === CSSRule.STYLE_RULE && isFixedPos(rule.style.position)) {
                    exploration.selectors.add(rule.selectorText);
                } else if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
                    exploreRules(rule.cssRules);
                } else if (rule.type === CSSRule.IMPORT_RULE && rule.styleSheet) {
                    exploreStylesheet({sheet: rule.styleSheet});
                }
            });
            if (cssRules) {
                sheetInfo.rulesCount = cssRules.length;
                exploreRules(cssRules);
            } else if (sheet.href) {
                // Bypass the CORS restrictions
                // TODO: This may cause extra requests. Look into 'only-if-cached'
                let iframe;
                asyncStylesheets.push(fetch(sheet.href, {method: 'GET', cache: 'force-cache'})
                    .then(response => response.ok ? response.text() : Promise.reject('Bad response'))
                    .then(text => {
                        iframe = document.createElement('iframe');
                        iframe.style.display = 'none';  // Isolate stylesheet to prevent reflow
                        document.body.appendChild(iframe);
                        let iframeDoc = iframe.contentDocument;
                        let base = sheet.href.trim().toLowerCase().indexOf('data:') === 0 ? sheet.ownerNode.baseURI : sheet.href;
                        if (base) (iframeDoc.head.appendChild(iframeDoc.createElement('base')).href = base);  // For @import
                        let style = iframeDoc.head.appendChild(iframeDoc.createElement('style'));
                        style.textContent = text;
                        exploreRules(style.sheet.cssRules);
                    })
                    .catch(err => log(`Error downloading stylesheet ${sheet.href}: ${err}`))
                    .finally(() => iframe && iframe.remove()));
            }
        };

        let anyRemoved = false;
        exploration.sheets.forEach(sheetInfo => {
            let sheet = sheetInfo.sheet;
            let isAlive = sheet => sheet && (!!sheet.ownerNode || isAlive(sheet.parentStyleSheet));
            if (!isAlive(sheet)) {  // The stylesheet has been removed.
                sheetInfo.removed = anyRemoved = true;
                exploration.sheetSet.delete(sheet);
            } else if (!sheet.href && sheet !== stickyFixer.stylesheet && sheetInfo.rulesCount !== sheet.cssRules.length) {
                // Stylesheets can be updated dynamically. It is detected by comparing rules size.
                exploreStylesheet(sheetInfo);
            }
        });
        if (anyRemoved) exploration.sheets = exploration.sheets.filter(sheetInfo => !sheetInfo.removed);

        _.forEach(document.styleSheets, sheet => {
            if (exploration.sheetSet.has(sheet)) return;
            exploration.sheetSet.add(sheet);
            let sheetInfo = {sheet: sheet};
            exploration.sheets.push(sheetInfo);
            exploreStylesheet(sheetInfo);
        });
        return asyncStylesheets.length && Promise.all(asyncStylesheets);
    };
    let async = measure('exploreStylesheets', exploreStylesheets);
    if (async) async.then(exploreSelectors).then(asyncCallback);
    return measure('exploreSelectors', exploreSelectors);
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
        let isInDOM = document.contains(s.el);
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
        s.type === 'hidden' && update('type', classify(s.el));
        update('status', !isInDOM && !isUnique ? 'removed' :
            (isFixedPos(window.getComputedStyle(s.el).position) ? 'fixed' : 'unfixed'));
    };
    measure('reviewStickies', () => exploredStickies.forEach(reviewSticky));
    // Explore if scrolled far enough from the last explored place. Explore once again a bit closer.
    let threshold = exploration.lastScrollY < window.innerHeight ? 0.25 : 0.5;
    let isFar = Math.abs(exploration.lastScrollY - scrollY) / window.innerHeight > threshold;
    if (isFar || exploration.limit > 0 || forceExplore) {
        let newStickies = explore(newStickies => newStickies.length && stickyFixer && stickyFixer.onChange(scrollY, true, true));
        forceUpdate |= newStickies.length > 0;
        isFar ? ((exploration.limit = 1) && (exploration.lastScrollY = scrollY)) : exploration.limit--;
    }
    stickyFixer.onChange(scrollY, forceUpdate);
    lastKnownScrollY = scrollY;
}

chrome.storage.local.get(['behavior', 'isDevelopment'], response => {
    isDevelopment = !!response.isDevelopment;
    // Hover works only when the client uses a mouse. If the device has touch capabilities, choose scroll
    let behavior = response.behavior || (DetectIt.deviceType === 'mouseOnly' ? 'hover' : 'scroll');
    log(`Behavior from storage ${response.behavior}; Device type ${DetectIt.deviceType}; `);
    updateBehavior(behavior);
    document.addEventListener('DOMContentLoaded', activateBehavior, false);
    document.addEventListener('readystatechange', () => {
        // Run several times waiting for JS on the page to do the changes affecting scrolling and stickies
        [0, 500, 1000, 2000].forEach(t => setTimeout(() => stickyFixer && doAll(true, false), t));
    });
});
chrome.storage.onChanged.addListener(changes => updateBehavior(changes.behavior.newValue));
