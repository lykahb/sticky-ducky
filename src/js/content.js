'use strict';
let exploration = {
    limit: 2,  // Limit for exploration on shorter scroll distance
    lastScrollY: 0,  // Keeps track of the scroll position during the last exploration
    // Storing the DOM nodes rather than stylesheet objects reduces memory consumption.
    internalSheets: [],  // Internal top level stylesheets along with metadata
    sheetNodeSet: new Set(),  // Owner nodes of all top level stylesheets
    selectors: new Set(['*[style*="fixed" i]', '*[style*="sticky" i]'])  // Selectors for the rules that make element sticky
};
let lastKnownScrollY = undefined;
let stickyFixer = null;
let settings = {
    // This a reference for the settings structure. The values will be updated.
    isDevelopment: true,
    behavior: 'hover',
    whitelist: {
        type: 'none', // ['none', 'page', 'selectors']
        selectors: [] // optional, if the type is 'selectors'
    }
};
let exploredStickies = [];
let scrollListener = _.debounce(_.throttle(() => doAll(), 300), 1);  // Debounce delay makes it run after the page scroll listeners
let transDuration = 0.2;
let typesToShow = ['sidebar', 'splash', 'hidden'];  // Hidden may mean that dimensions of a hidden element are unknown
let selectorGenerator = new CssSelectorGenerator();

class StickyFixer {
    constructor(fixer, getNewState, hideStyles) {
        this.stylesheet = fixer ? fixer.stylesheet : null;
        this.state = fixer ? fixer.state : 'show'; // hide, show, showFooters
        this.getNewState = getNewState;
        this.hideStyles = hideStyles;
    }

    onChange(scrollY, forceUpdate, keepState) {
        let stickies = exploredStickies.filter(s =>
            s.status === 'fixed' && !typesToShow.includes(s.type) && !s.isWhitelisted);
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

let log = (...args) => settings.isDevelopment && console.log("Sticky Ducky: ", ...args);
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
    let scrollCandidates = [window, document.body];
    if (shouldBeActive) {
        // Detecting passive events on Firefox and setting the listener immediately is buggy. Manifest supports only browsers that have it.
        if(!isActive) {
            scrollCandidates.forEach(target => target.addEventListener('scroll', scrollListener, {passive: true}));
        }
        stickyFixer = fixers[settings.behavior](stickyFixer);
        doAll(true, true);
    } else if (isActive && !shouldBeActive) {
        scrollCandidates.forEach(target => target.removeEventListener('scroll', scrollListener));
        stickyFixer.stylesheet && stickyFixer.stylesheet.ownerNode.remove();
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
    let selector = [...exploration.selectors].join(',');
    let oldStickies = _.pluck(exploredStickies, 'el');
    let potentialEls = document.querySelectorAll(selector);
    let newStickies = _.filter(potentialEls, el => !oldStickies.includes(el)).map(makeStickyObj);
    if (newStickies.length) exploredStickies.push(...newStickies);
    log("exploredStickies", exploredStickies);
    return newStickies;
};

let makeStickyObj = el => ({
    el: el,
    type: classify(el),
    selector: highSpecificitySelector(el),
    isWhitelisted: settings.whitelist.type === 'selectors' 
        && settings.whitelist.selectors.some(s => el.matches(s)),
    status: isFixedPos(window.getComputedStyle(el).position) ? 'fixed' : 'unfixed'
});

function explore() {
    let exploreStylesheets = () => {
        let anyRemoved = false;
        let explorer = new Explorer((href, baseURI, err) => {
            log('Fetch failed', href, baseURI, err);
            vAPI.sendToBackground('exploreSheet', {href: href, baseURI: baseURI});
        });
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

        _.forEach(document.styleSheets, sheet => {
            if (sheet === stickyFixer.stylesheet ||
                !sheet.ownerNode ||
                exploration.sheetNodeSet.has(sheet.ownerNode)) return;
            exploration.sheetNodeSet.add(sheet.ownerNode);
            if (!sheet.href) {
                let sheetInfo = {ownerNode: sheet.ownerNode, rulesCount: sheet.cssRules.length};
                exploration.internalSheets.push(sheetInfo);
            }
            explorer.exploreStylesheet(sheet);
        });
        onNewSelectors(explorer.selectors);
        explorer.wait().then(onNewSelectors);  // Add the selectors found asynchronously
    };
    measure('exploreStylesheets', exploreStylesheets);
    return measure('exploreStickies', exploreStickies);
}

function onNewSelectors(selectors) {
    if (selectors.length === 0) return;
    let oldSize = exploration.selectors.size;
    selectors.forEach(s => exploration.selectors.add(s));
    if (stickyFixer && exploration.selectors.size > oldSize && exploreStickies().length)
        stickyFixer.onChange(scrollY, true, true);
}

function doAll(forceExplore, settingsChanged) {
    // Do nothing unless scrolled by about 5%
    let forceUpdate = settingsChanged;
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
        if (isInDOM && !isUnique) update('selector', highSpecificitySelector(s.el));
        if (!isInDOM && isUnique) s.el = els[0]; // Does not affect stylesheet, so no update
        // The dimensions are unknown until it's shown
        if (s.type === 'hidden') update('type', classify(s.el));
        update('status', !isInDOM && !isUnique ? 'removed' :
            (isFixedPos(window.getComputedStyle(s.el).position) ? 'fixed' : 'unfixed'));
    };
    if (settingsChanged) {
        exploredStickies = [];  // Clear in case whitelist rules changed
    } else {
        measure('reviewStickies', () => exploredStickies.forEach(reviewSticky));
    }
    // Explore if scrolled far enough from the last explored place. Explore once again a bit closer.
    let threshold = exploration.lastScrollY < window.innerHeight ? 0.25 : 0.5;
    let isFar = Math.abs(exploration.lastScrollY - scrollY) / window.innerHeight > threshold;
    if (isFar || exploration.limit > 0 || forceExplore) {
        let newStickies = explore();
        forceUpdate |= newStickies.length > 0;
        if (isFar) {
            exploration.limit = 1;
            exploration.lastScrollY = scrollY;
        } else exploration.limit--;
    }
    stickyFixer.onChange(scrollY, forceUpdate);
    lastKnownScrollY = scrollY;
}

if (window.top === window) {  // Don't do anything within an iframe
    vAPI.listen('settings', settings => onNewSettings(settings));
    vAPI.listen('sheetExplored', message => onNewSelectors(message.selectors));
    vAPI.sendToBackground('getSettings', {location: _.omit(window.location, _.isFunction)});

    document.addEventListener('readystatechange', () => {
        // Run several times waiting for JS on the page to do the changes affecting scrolling and stickies
        [0, 500].forEach(t => setTimeout(() => stickyFixer && doAll(true, false), t));
    });
}
