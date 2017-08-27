const isDevelopment = true;
let explorationsLimit = 10;  // Exploring elements is costly. After some scrolling around, it can be stopped
let exploredStickies = [];
let behavior = 'hover';
let scrollListener = _.throttle(() => doAll(), 100);

class StickyFixer {
    constructor(fixer, shouldHide, hideStyles) {
        this.selectorGenerator = new CssSelectorGenerator();
        this.stylesheet = fixer ? fixer.stylesheet : null;
        this.hidden = fixer ? fixer.hidden : false;
        this.shouldHide = shouldHide;
        this.hideStyles = hideStyles;
    }

    updateStylesheetOnScroll(stickies, forceUpdate) {
        let shouldHide = this.shouldHide();
        if (forceUpdate || stickies.length && shouldHide !== this.hidden) {
            let selectors = stickies.map(s => {
                if (!s.selector || !this.selectorGenerator.testSelector(s.el, s.selector, true)) {
                    s.selector = this.selectorGenerator.getSelector(s.el);
                }
                return s.selector;
            });
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
        let toFix = stickies.filter(s => s.type !== 'sidebar');
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
                '{ transition: opacity 0.3s ease-in-out; }' :
                `{ transition: opacity 0.3s ease-in-out; opacity: ${opacity};}`;
            return _.pluck(stickies, 'selector').join(',') + rule;
        });
    }

    destroy(stickies) {
        stickies.filter(s => s.styleOpacity).map(s => s.el.style.opacity = s.styleOpacity);
        this.stylesheet.ownerNode.remove();
    }
}

let hoverFixer = (fixer) => new StickyFixer(fixer,
    () => window.scrollY / window.innerHeight > 0.15,
    (selectors, showStyles) =>
        [selectors.map(s => s + ':not(:hover)').join(',') + '{ opacity: 0 !IMPORTANT; animation: none; }'].concat(showStyles));
let scrollFixer = (fixer) => new StickyFixer(fixer,
    () => {
        let lastKnownScrollY = this.lastKnownScrollY;
        let currentScrollY = this.lastKnownScrollY = window.scrollY;
        let notOnTop = currentScrollY / window.innerHeight > 0.15;
        return notOnTop && (!lastKnownScrollY || currentScrollY >= lastKnownScrollY);
    },
    selectors =>
        [selectors.join(',') + '{ opacity: 0 !IMPORTANT; visibility: hidden; animation: none; transition: opacity 0.3s ease-in-out, visibility 0s 0.3s; }']);
let topFixer = (fixer) => new StickyFixer(fixer,
    () => window.scrollY / window.innerHeight > 0.15,
    selectors =>
        [selectors.join(',') + '{ opacity: 0 !IMPORTANT; visibility: hidden; animation: none; transition: opacity 0.3s ease-in-out, visibility 0s 0.3s; }']);

let stickyFixer = null;
let fixers = {
    'hover': hoverFixer,
    'scroll': scrollFixer,
    'top': topFixer
};

let log = (...args) => isDevelopment && console.log("remove headers: ", ...args);

function classify(rect) {
    // header, footer, splash, widget, sidebar
    const clientWidth = window.innerWidth,
        clientHeight = window.innerHeight;

    if (rect.width / clientWidth > 0.35) {
        if (rect.height / clientHeight < 0.25) {
            return rect.top / clientHeight < 0.25 ? "header" : "footer";
        } else {
            return "splash";
        }
    } else {
        if (rect.height / clientHeight > 0.5 && (rect.left / clientWidth < 0.1 || rect.right / clientWidth > 0.9)) {
            return "sidebar"
        }
        return "widget";
    }
}

function elementFromPoint(x, y, isPercent) {
    if (isPercent) {
        x = document.documentElement.clientWidth * x;
        y = document.documentElement.clientHeight * y;
    }
    return document.elementFromPoint(x, y);
}

function exploreInVicinity(rect) {
    const middleX = rect.left + rect.width / 2,
        middleY = rect.top + rect.height / 2,
        // TODO: use more dense samples
        coords = [[middleX, rect.top - 5], [middleX, rect.bottom + 5],
            [rect.left - 5, middleY], [rect.right + 5, middleY], [middleX, middleY]];

    return _.uniq(coords.map(([x, y]) => elementFromPoint(x, y)).filter(Boolean));
}

function explore(stickies) {
    let parentSticky = el => {
        for (; el && el.tagName !== "HTML"; el = el.parentNode) {
            if (window.getComputedStyle(el).position === "fixed") {
                return el;
            }
        }
    };
    let filterSticky = els => _.uniq(els.map(parentSticky).filter(Boolean));
    let makeStickyObj = el => {
        let rect = el.getBoundingClientRect();
        return {el: el, rect: rect, type: classify(rect)};
    };
    let newStickies = [];
    let allEls = _.pluck(stickies, 'el');
    let addExploredEls = els => {
        let newStickiesObj = els.map(makeStickyObj);
        allEls = allEls.concat(els);
        newStickies = newStickies.concat(newStickiesObj);
        stickies = stickies.concat(newStickiesObj);
    };

    if (stickies.length === 0) {
        // There may be several fixed headers, one below another, and directly under (z-indexed).
        let topRow = _.range(0, 1, 0.1).map(x => [x, 0.01]),
            bottomRow = _.range(0, 1, 0.1).map(x => [x, 0.95]),
            allCoords = topRow.concat(bottomRow),
            initial = _.uniq(allCoords.map(([x, y]) => elementFromPoint(x, y, true)));
        log(`Checking ${initial.length} elements`, initial);
        addExploredEls(filterSticky(initial));
    }

    for (let i = 0; i < stickies.length; i++) {
        let newEls = _.difference(filterSticky(exploreInVicinity(stickies[i].rect)), allEls);
        newEls.length && addExploredEls(newEls);
    }
    return newStickies;
}

function doAll(forceUpdate) {
    let activeRemoved = _.partition(exploredStickies, s => document.body.contains(s.el));
    if (activeRemoved[1].length) {
        log("Removed from DOM: ", activeRemoved[1]);
        exploredStickies = activeRemoved[0];
    }
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
    stickyFixer.updateFixerOnScroll(exploredStickies, forceUpdate || newStickies.length > 0);
}

function updateBehavior(newBehavior, init) {
    log(newBehavior);
    let wasActive = behavior !== 'always' && !init;
    if (newBehavior !== 'always') {
        stickyFixer = fixers[newBehavior](stickyFixer);
        init && document.addEventListener('DOMContentLoaded', () => doAll(), false);
        !wasActive && window.addEventListener("scroll", scrollListener, Modernizr.passiveeventlisteners ? {passive: true} : false);
        !init && doAll(true);
    } else if (wasActive) {
        window.removeEventListener('scroll', scrollListener);
        stickyFixer.destroy(exploredStickies);
        stickyFixer = null;
    }
    behavior = newBehavior;
}

chrome.storage.local.get('behavior', response => updateBehavior(response.behavior || behavior, true));
chrome.runtime.onMessage.addListener(request => updateBehavior(request.behavior));