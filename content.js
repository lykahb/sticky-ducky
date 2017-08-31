const isDevelopment = true;
let explorationsLimit = 10;  // Exploring elements is costly. After some scrolling around, it can be stopped
let exploredStickies = [];
let behavior = null;
let scrollListener = _.debounce(_.throttle(() => doAll(), 300), 25);
let transDuration = 0.2;
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
            this.showStyles = !forceUpdate && this.showStyles || this.getShowStyles(stickies);
            let css = !stickies.length ? []
                : (shouldHide ? this.hideStyles(selectors, this.showStyles) : this.showStyles);
            this.updateStylesheet(css);
            this.hidden = shouldHide;
        }
    }

    // Opacity is the best way to fix the headers. Setting position to fixed breaks some layouts
    // In case the header has animation keyframes involving opacity, set animation to none
    updateStylesheet(rules) {
        if (!this.stylesheet) {
            let style = document.head.appendChild(document.createElement('style'));
            style.type = 'text/css';
            this.stylesheet = style.sheet;
        }
        _.map(this.stylesheet.cssRules, () => this.stylesheet.deleteRule(0));
        rules.forEach((rule, i) => this.stylesheet.insertRule(rule, i));
    }

    updateFixerOnScroll(stickies, forceUpdate) {
        let toFix = stickies.filter(s => s.status === 'fixed' && s.type !== 'sidebar');
        if (forceUpdate) {
            // Check if opacity is directly in style. DOM changes don't work well with reactive websites
            log("Fixing: ", toFix);
            toFix.filter(s => s.el.style.opacity).forEach(s => {
                    s.styleOpacity = s.el.style.opacity;
                    s.el.style.opacity = "";
                }
            );
        }
        this.updateStylesheetOnScroll(toFix, forceUpdate);
    }

    getShowStyles(stickies) {
        let byStyleOpacity = _.groupBy(stickies, 'styleOpacity');
        // Restore opacity to the original value set in style
        return Object.entries(byStyleOpacity).map(([opacity, stickies]) => {
            let rule = opacity === 'undefined' ?
                `{ transition: opacity ${transDuration}s ease-in-out; }` :
                `{ transition: opacity ${transDuration}s ease-in-out; opacity: ${opacity};}`;
            return _.pluck(stickies, 'selector').join(',') + rule;
        });
    }

    destroy(stickies) {
        stickies.filter(s => s.styleOpacity).map(s => s.el.style.opacity = s.styleOpacity);
        this.stylesheet.ownerNode.remove();
    }
}

let hoverFixer = (fixer) => new StickyFixer(fixer,
    () => window.scrollY / window.innerHeight > 0.1,
    (selectors, showStyles) =>
        [selectors.map(s => s + ':not(:hover)').join(',') + '{ opacity: 0 !IMPORTANT; animation: none; }'].concat(showStyles));
let scrollFixer = (fixer) => new StickyFixer(fixer,
    () => {
        let lastKnownScrollY = this.lastKnownScrollY;
        let currentScrollY = this.lastKnownScrollY = window.scrollY;
        let notOnTop = currentScrollY / window.innerHeight > 0.1;
        // TODO: tolerance to small scroll
        return notOnTop && (!lastKnownScrollY || currentScrollY >= lastKnownScrollY);
    },
    selectors =>
        [selectors.join(',') + `{ opacity: 0 !IMPORTANT; visibility: hidden; animation: none; transition: opacity ${transDuration}s ease-in-out, visibility 0s ${transDuration}s; }`]);
let topFixer = (fixer) => new StickyFixer(fixer,
    () => window.scrollY / window.innerHeight > 0.1,
    selectors =>
        [selectors.join(',') + `{ opacity: 0 !IMPORTANT; visibility: hidden; animation: none; transition: opacity ${transDuration}s ease-in-out, visibility 0s ${transDuration}s; }`]);

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

function classify(rect) {
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
        || isWide && 'splash'
        || isTall && isOnSide && 'sidebar'
        || 'widget';
}

function elementFromPoint(x, y, isPercent) {
    if (isPercent) {
        x = document.documentElement.clientWidth * x;
        y = document.documentElement.clientHeight * y;
    }
    return document.elementFromPoint(x, y);
}

function elementsInVicinity(rect) {
    const middleX = rect.left + rect.width / 2,
        middleY = rect.top + rect.height / 2,
        // TODO: use more dense samples
        coords = [[middleX, rect.top - 5], [middleX, rect.bottom + 5],
            [rect.left - 5, middleY], [rect.right + 5, middleY], [middleX, middleY]];
    return _.uniq(coords.map(([x, y]) => elementFromPoint(x, y)).filter(Boolean));
}

function explore(stickies) {
    let newStickies = [];
    let allEls = _.pluck(stickies, 'el');
    let parentSticky = el => {
        for (; el && el.tagName !== "HTML"; el = el.parentNode) {
            if (window.getComputedStyle(el).position === "fixed") return el;
        }
    };
    let filterSticky = els => _.uniq(els.map(parentSticky).filter(Boolean));
    let makeStickyObj = el => {
        let rect = el.getBoundingClientRect();
        return {el: el, rect: rect, type: classify(rect), selector: selectorGenerator.getSelector(el), status: 'fixed'};
    };
    let addExploredEls = els => {
        els = _.difference(els, allEls);
        if (!els.length) return;
        let newStickiesObj = els.map(makeStickyObj);
        allEls = allEls.concat(els);
        newStickies = newStickies.concat(newStickiesObj);
        stickies = stickies.concat(newStickiesObj);
    };
    let exploreInVicinity = () => {
        for (let i = 0; i < stickies.length; i++) {
            addExploredEls(filterSticky(elementsInVicinity(stickies[i].rect)));
        }
    };
    let exploreInSelection = els => {
        log(`Checking ${els.length} elements in selection`);
        addExploredEls(_.filter(els, el => window.getComputedStyle(el).position === 'fixed'));
    };
    let exploreInViewport = () => {
        let topRow = _.range(0, 1, 0.1).map(x => [x, 0.01]),
            bottomRow = _.range(0, 1, 0.1).map(x => [x, 0.95]),
            allCoords = topRow.concat(bottomRow),
            initial = _.uniq(allCoords.map(([x, y]) => elementFromPoint(x, y, true)));
        log(`Checking ${initial.length} elements in viewport`);
        addExploredEls(filterSticky(initial));
    };
    if (stickies.length === 0) {
        let bodyElements = document.body.getElementsByTagName('*');
        bodyElements.length < 2000 ?
            measure('exploreInSelection', () => exploreInSelection(bodyElements)) :
            measure('exploreInViewport', () => exploreInViewport());
    } else {
        measure('exploreInVicinity', () => exploreInVicinity());
    }
    return newStickies;
}

function doAll(forceUpdate) {
    // TODO: throttle on scroll delta and time
    let newStickies = [];
    if (explorationsLimit) {
        newStickies = explore(exploredStickies);
        exploredStickies = exploredStickies.concat(newStickies);
        log("exploredStickies", exploredStickies);
    }
    if (explorationsLimit > 0 && window.scrollY > window.innerHeight) {
        log(`decrement ${explorationsLimit}`);
        explorationsLimit--;
    }
    let reviewStickies = () => exploredStickies.forEach(s => {
        // An element may be moved elsewhere, removed and returned to DOM later. It tries to recover them by selector.
        let els = document.querySelectorAll(s.selector);
        let isUnique = els.length === 1;
        let isInDOM = document.body.contains(s.el);
        isInDOM && !isUnique && (s.selector = selectorGenerator.getSelector(s.el));
        !isInDOM && isUnique && (s.el = els[0]);
        s.status = !isInDOM && !isUnique ? 'removed' :
            (window.getComputedStyle(s.el).position === 'fixed' ? 'fixed' : 'unfixed');
    });
    reviewStickies();
    stickyFixer.updateFixerOnScroll(exploredStickies, forceUpdate || newStickies.length > 0);
}

function updateBehavior(newBehavior, init) {
    log(newBehavior);
    let wasActive = behavior !== 'always' && !init;
    // Hover works when the client uses a mouse. If the device has touch capabilities, choose scroll
    let defBehavior = "ontouchstart" in window || window.navigator.msMaxTouchPoints > 0 ? 'scroll' : 'hover';
    newBehavior = newBehavior || defBehavior;
    if (newBehavior !== 'always') {
        stickyFixer = fixers[newBehavior](stickyFixer);
        init && document.addEventListener('DOMContentLoaded', () => doAll(), false);
        init && document.addEventListener('load', () => doAll(), false);
        !wasActive && window.addEventListener("scroll", scrollListener, Modernizr.passiveeventlisteners ? {passive: true} : false);
        !init && doAll(true);
    } else if (wasActive) {
        window.removeEventListener('scroll', scrollListener);
        stickyFixer.destroy(exploredStickies);
        stickyFixer = null;
    }
    behavior = newBehavior;
}

chrome.storage.local.get('behavior', response => updateBehavior(response.behavior, true));
chrome.runtime.onMessage.addListener(request => updateBehavior(request.behavior));