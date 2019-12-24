'use strict';
let exploration = {
    limit: 2,  // Limit for exploration on shorter scroll distance
    lastScrollY: 0,  // Keeps track of the scroll position during the last exploration
    // Storing the DOM nodes rather than stylesheet objects reduces memory consumption.
    internalSheets: [],  // Internal top level stylesheets along with metadata
    externalSheets: {},  // A map where href is key and metadata is value
    sheetNodeSet: new Set(),  // Owner nodes of all top level stylesheets
    selectors: {
        fixed: [{selector: '*[style*="fixed" i]', position: 'fixed'}],
        sticky: [{selector: '*[style*="sticky" i]', position: 'sticky'}],
        pseudoElements: []
    },

};
let lastKnownScrollY = undefined;
let stickyFixer = null;
let settings = {
    // This a reference for the settings structure. The values will be updated.
    isDevelopment: false,
    behavior: 'hover',
    whitelist: {
        type: 'none', // ['none', 'page', 'selectors']
        selectors: [] // optional, if the type is 'selectors'
    }
};
let exploredStickies = [];
let scrollListener = _.debounce(_.throttle(ev => doAll(false, false, ev), 300), 50);  // Debounce delay makes it run after the page scroll listeners
let transDuration = 0.2;
let typesToShow = ['sidebar', 'splash', 'hidden'];  // Hidden may mean that dimensions of a hidden element are unknown
let selectorGenerator = new CssSelectorGenerator();

class StickyFixer {
    constructor(fixer, getNewState, makeSelectorForHidden, hiddenStyle) {
        this.stylesheet = fixer ? fixer.stylesheet : null;
        this.state = fixer ? fixer.state : 'show'; // hide, show, showFooters
        this.getNewState = getNewState;
        this.makeSelectorForHidden = makeSelectorForHidden;
        this.hiddenStyle = hiddenStyle;
    }

    onChange(scrollInfo, forceUpdate) {
        let state = this.state;
        if (scrollInfo) {
            let input = {
                scrollY: scrollInfo.scrollY,
                oldState: this.state,
                isOnTop: scrollInfo.scrollY / window.innerHeight < 0.1,
                isOnBottom: (scrollInfo.scrollHeight - scrollInfo.scrollY) / window.innerHeight < 1.3  // close to 1/3 of the last screen
            };
            let defaultState = input.isOnTop && 'show' || input.isOnBottom && 'showFooters' || 'hide';
            state = this.getNewState(defaultState, input);
        }
        if (forceUpdate || state !== this.state) {
            this.updateStylesheet(this.getRules(state));
            this.state = state;
        }
    }

    getRules(state) {
        // Opacity is the best way to fix the headers. Removing the fixed position breaks some layouts.
        // In case the element has animation keyframes involving opacity, set animation to none
        let rules = [];

        if (exploration.selectors.sticky.length) {
            // Set all sticky elements position to initial, ignoring their classification and the show/hide settings.
            // It is feasible because, unlike some fixed elements, they have a proper place on the page.
            rules.push(exploration.selectors.sticky.map(s => s.selector).join(',') + makeStyle({position: 'initial'}));
        }

        if (exploration.selectors.pseudoElements.length && state !== 'show') {
            // Hide all fixed pseudo-elements. They cannot be classified, as you can't get their bounding rect
            let allSels = exploration.selectors.pseudoElements.map(s => s.selector);
            rules.push(allSels.join(',') + makeStyle({transition: `opacity ${transDuration}s ease-in-out;`}));  // Show style
            let selector = exploration.selectors.pseudoElements.map(s => `${this.makeSelectorForHidden(s.selector)}::${s.pseudoElement}`).join(',');
            rules.push(`${selector} ${this.hiddenStyle}`);
        }

        let stickies = exploredStickies.filter(s =>
            s.status === 'fixed' && !typesToShow.includes(s.type) && !s.isWhitelisted);
        if (stickies.length) {
            let allSels = stickies.map(s => s.selector);
            rules.push(allSels.join(',') + makeStyle({transition: `opacity ${transDuration}s ease-in-out;`}));  // Show style
            let selsToHide = state === 'hide' && allSels
                || state === 'showFooters' && stickies.filter(s => s.type !== 'footer').map(s => s.selector)
                || [];
            if (selsToHide.length) {
                let selector = selsToHide.map(this.makeSelectorForHidden).join(',');
                rules.push(`${selector} ${this.hiddenStyle}`);
            }
        }
        return rules;
    }

    updateStylesheet(rules) {
        if (!this.stylesheet) {
            let style = document.head.appendChild(document.createElement('style'));
            this.stylesheet = style.sheet;
        }
        // TODO: compare cssText against the rule and replace only mismatching rules
        _.map(this.stylesheet.cssRules, () => this.stylesheet.deleteRule(0));
        rules.forEach(rule => this.stylesheet.insertRule(rule, this.stylesheet.cssRules.length));
    }
}

let fixers = {
    'hover': fixer => new StickyFixer(fixer,
        defaultState => defaultState,
        selector => selector + ':not(:hover)',
        makeStyle({opacity: 0, animation: 'none'})),
    'scroll': fixer => new StickyFixer(fixer,
        (defaultState, {scrollY, oldState}) =>
            scrollY === lastKnownScrollY && oldState
            || scrollY < lastKnownScrollY && 'show'
            || defaultState,
        selector => selector,
        makeStyle({
            opacity: 0,
            visibility: 'hidden',
            transition: `opacity ${transDuration}s ease-in-out, visibility 0s ${transDuration}s`,
            animation: 'none'
        })),
    'top': fixer => new StickyFixer(fixer,
        defaultState => defaultState,
        selector => selector,
        makeStyle({
            opacity: 0,
            visibility: 'hidden',
            transition: `opacity ${transDuration}s ease-in-out, visibility 0s ${transDuration}s`,
            animation: 'none'
        })),
    'absolute': fixer => new StickyFixer(fixer,
        defaultState => defaultState,
        selector => selector,
        makeStyle({position: 'absolute'})),
};

function makeStyle(styles) {
    let stylesText = Object.keys(styles).map(name => `${name}: ${styles[name]} !important;`);
    return `{ ${stylesText.join('')} }`;
}

function getDocumentHeight(ev) {
    // http://james.padolsey.com/javascript/get-document-height-cross-browser/
    let body = document.body, html = document.documentElement;
    return Math.max(
        body.scrollHeight, body.offsetHeight, body.clientHeight,
        html.scrollHeight, html.offsetHeight, html.clientHeight);
}

let log = (...args) => settings.isDevelopment && console.log('Sticky Ducky: ', ...args);
let measure = (label, f) => {
    if (!settings.isDevelopment) return f();
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

function onNewSettings(newSettings) {
    // The new settings may contain only the updated properties
    _.extend(settings, newSettings);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', activateSettings);
    } else {
        activateSettings();
    }
}

function activateSettings() {
    log(`Activating behavior ${settings.behavior}`);
    let isActive = !!stickyFixer;  // Presence of stickyFixer indicates that the scroll listener is set
    let shouldBeActive = settings.behavior !== 'always' && settings.whitelist.type !== 'page';
    if (shouldBeActive) {
        // Detecting passive events on Firefox and setting the listener immediately is buggy. Manifest supports only browsers that have it.
        if (!isActive) {
            document.addEventListener('scroll', scrollListener, {passive: true, capture: true});
        }
        stickyFixer = fixers[settings.behavior](stickyFixer);
        doAll(true, true);
    } else if (isActive && !shouldBeActive) {
        document.removeEventListener('scroll', scrollListener);
        if (stickyFixer.stylesheet) stickyFixer.stylesheet.ownerNode.remove();
        stickyFixer = null;
    }
}

let highSpecificitySelector = el => {
    // There is always the unique selector since we use nth-child.
    let {selectors, element} = selectorGenerator.getSelectorObjects(el);
    let boostId = () => selectors.find(s => s.id && (s.id = s.id + s.id));
    let ascendantId = () => {
        let directParent = element.parentElement;
        for (let el = directParent; el; el = el.parentElement) {
            let sel = selectorGenerator.getIdSelector(el);
            if (sel) return sel + (el === directParent ? ' > ' : ' ');
        }
        return '';
    };
    let boostClassesOrAttributes = () => {
        let selector = selectors.find(s => s.class || s.attribute);
        let list = selector && (selector.class || selector.attribute);
        if (list) list.push(...list);
    };
    // Increase specificity of the selector
    boostId() || boostClassesOrAttributes();
    return ascendantId() + selectors.map(sel => selectorGenerator.stringifySelectorObject(sel)).join(' > ');
};

let exploreStickies = () => {
    let selectors = exploration.selectors.fixed.map(s => s.selector);
    let oldStickies = _.pluck(exploredStickies, 'el');
    let potentialEls = document.querySelectorAll(selectors.join(','));
    let newStickies = _.filter(potentialEls, el => !oldStickies.includes(el)).map(makeStickyObj);
    if (newStickies.length) exploredStickies.push(...newStickies);
    log('exploredStickies', exploredStickies);
    return newStickies;
};

let makeStickyObj = el => ({
    el: el,
    type: classify(el),
    selector: highSpecificitySelector(el),
    isWhitelisted: settings.whitelist.type === 'selectors'
        && settings.whitelist.selectors.some(s => el.matches(s)),
    status: isFixedPosition(window.getComputedStyle(el).position) ? 'fixed' : 'unfixed'
});

function explore() {
    let exploreStylesheets = () => {
        let anyRemoved = false;
        let explorer = new Explorer(result => onSheetExplored(result));
        // We detect dynamic updates for the internal stylesheets by comparing rules size.
        // All internal (declared with <style>) stylesheets have cssRules available.
        // Updates to external and imported stylesheets are not checked.
        exploration.internalSheets.forEach(sheetInfo => {
            let ownerNode = sheetInfo.ownerNode;
            if (!document.contains(ownerNode)) {  // The stylesheet has been removed.
                sheetInfo.removed = anyRemoved = true;
                exploration.sheetNodeSet.delete(ownerNode);
                return;
            }
            if (sheetInfo.rulesCount !== ownerNode.sheet.cssRules.length) {
                explorer.exploreStylesheet(ownerNode.sheet);
                sheetInfo.rulesCount = ownerNode.sheet.cssRules.length;
            }
        });
        if (anyRemoved) exploration.internalSheets = exploration.internalSheets.filter(sheetInfo => !sheetInfo.removed);

        // TODO: If the page uses Web Components the styles won't be in the document

        _.forEach(document.styleSheets, sheet => {
            if (sheet === stickyFixer.stylesheet ||
                !sheet.ownerNode ||
                exploration.sheetNodeSet.has(sheet.ownerNode)) return;
            exploration.sheetNodeSet.add(sheet.ownerNode);
            if (sheet.href) {
                let sheetInfo = {status: 'unexplored'};
                exploration.externalSheets[sheet.href] = sheetInfo;
            } else {
                let sheetInfo = {ownerNode: sheet.ownerNode, rulesCount: sheet.cssRules.length};
                exploration.internalSheets.push(sheetInfo);
            }
            explorer.exploreStylesheet(sheet);
        });
    };
    measure('exploreStylesheets', exploreStylesheets);
    return measure('exploreStickies', exploreStickies);
}

function onSheetExplored(result) {
    if (result.status === 'success') {
        onNewSelectors(result.selectors);
    }
    if (result.href) {
        let sheetInfo = exploration.externalSheets[result.href];
        if (result.status === 'fail') {
            if (sheetInfo.status === 'unexplored') {
                exploration.externalSheets[result.href] = {
                    status: 'awaitingBackgroundFetch',
                    error: result.error
                };
                vAPI.sendToBackground('exploreSheet', {
                    href: result.href, baseURI: result.baseURI
                });
            } else {
                exploration.externalSheets[result.href] = {
                    status: 'fail',
                    error: result.error
                };
            }
        } else if (result.status === 'success') {
            exploration.externalSheets[result.href] = {
                status: 'success'
            };
        }
    }
}

function onNewSelectors(selectorDescriptions) {
    if (selectorDescriptions.length === 0) return;
    let forceUpdate = false;
    let forceExplore = false;
    // The duplicates occur only when the rules duplicate in the website stylesheets. They are rare and not worth checking.
    selectorDescriptions.forEach(description => {
        if (description.pseudoElement) {
            forceUpdate = true;
            exploration.selectors.pseudoElements.push(description);
        } else if (description.position === 'sticky') {
            forceUpdate = true;
            exploration.selectors.sticky.push(description);
        } else if (description.position === 'fixed') {
            forceExplore = true;
            exploration.selectors.fixed.push(description);
        }
    });
    if (!stickyFixer) return;  // Nothing left to do after recording the selectors
    if (forceExplore && exploreStickies().length) forceUpdate = true;
    if (forceUpdate) stickyFixer.onChange(undefined, true);
}

function doAll(forceExplore, settingsChanged, ev) {
    let forceUpdate = settingsChanged;
    let scrollInfo;
    if (ev) {
        let isPageScroller = ev.target === document || ev.target.clientHeight === window.innerHeight;
        if (!isPageScroller) return;
        scrollInfo = {
            scrollY: ev.target === document ? window.scrollY : ev.target.scrollTop,
            scrollHeight: ev.target === document ? getDocumentHeight() : ev.target.scrollHeight,
        };
        // Do nothing unless scrolled by about 5%
        if (lastKnownScrollY !== undefined && Math.abs(lastKnownScrollY - scrollInfo.scrollY) / window.innerHeight < 0.05) return;
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
        if (isInDOM && !isUnique) update('selector', highSpecificitySelector(s.el));
        if (!isInDOM && isUnique) s.el = els[0]; // Does not affect stylesheet, so no update
        // The dimensions are unknown until it's shown
        if (s.type === 'hidden') update('type', classify(s.el));
        update('status', !isInDOM && !isUnique ? 'removed' :
            (isFixedPosition(window.getComputedStyle(s.el).position) ? 'fixed' : 'unfixed'));
    };
    if (settingsChanged) {
        exploredStickies = [];  // Clear in case whitelist rules changed
    } else {
        measure('reviewStickies', () => exploredStickies.forEach(reviewSticky));
    }
    // Explore if scrolled far enough from the last explored place. Explore once again a bit closer.
    let threshold = exploration.lastScrollY < window.innerHeight ? 0.25 : 0.5;
    let isFar = scrollInfo && Math.abs(exploration.lastScrollY - scrollInfo.scrollY) / window.innerHeight > threshold;
    if (isFar || exploration.limit > 0 || forceExplore) {
        let newStickies = explore();
        forceUpdate = forceUpdate || newStickies.length > 0;
        exploration.limit--;
        if (isFar) {
            exploration.limit = 1;
            exploration.lastScrollY = scrollInfo.scrollY;
        }
    }
    stickyFixer.onChange(scrollInfo, forceUpdate);
    if (scrollInfo) {
        lastKnownScrollY = scrollInfo.scrollY;
    }
}

if (window.top === window) {  // Don't do anything within an iframe
    vAPI.listen('settings', settings => onNewSettings(settings));
    vAPI.listen('sheetExplored', message => onSheetExplored(message));
    vAPI.sendToBackground('getSettings', {location: _.omit(window.location, _.isFunction)});

    document.addEventListener('readystatechange', () => {
        // Run several times waiting for JS on the page to do the changes affecting scrolling and stickies
        [0, 500].forEach(t => setTimeout(() => stickyFixer && doAll(true, false), t));
    });
}
