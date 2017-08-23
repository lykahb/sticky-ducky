// TODO: do not hide header when it would be regularly shown
// TODO: debounce scroll event
// Options: show on hover, show on scroll up (Headroom), hide
const isDevelopment = true;
// Exploring elements is costly. After some scrolling around, it can be stopped
let explorationsLimit = 2;
let exploredStickies = [];

class StickyFixer {
    constructor(shouldHide, toggle) {
        this.selectorGenerator = new CssSelectorGenerator();
        this.stylesheet = null;
        this.hidden = false;
        this.shouldHide = shouldHide;
        this.toggle = toggle;
    }

    updateStylesheetOnScroll(stickies, forceUpdate) {
        let shouldHide = this.shouldHide();
        if (forceUpdate || stickies.length && shouldHide !== this.hidden) {
            let selectors = stickies.map(s => {
                if (!s.selector || !this.selectorGenerator.testSelector(s.selector)) {
                    s.selector = this.selectorGenerator.getSelector(s.el);
                }
                return s.selector;
            });
            let css = this.toggle(shouldHide, selectors);
            this.updateStylesheet(css);
            this.hidden = shouldHide;
        }
    }

    updateStylesheet(rules) {
        if (!this.stylesheet) {
            let style = document.createElement('style');
            style.type = 'text/css';
            document.head.appendChild(style);
            this.stylesheet = style.sheet;
        }
        while (this.stylesheet.cssRules.length) {
            this.stylesheet.deleteRule(0);
        }
        rules.forEach(rule => this.stylesheet.insertRule(rule, 0));
    }

    updateFixerOnScroll(stickies, newStickies) {
        let toFix = stickies.filter(s => s.type !== 'sidebar');
        if (newStickies.length) {
            // Check if opacity is directly in style. DOM changes don't work well with reactive websites
            log("Fixing: ", toFix);
            toFix.filter(s => s.el.style.opacity).forEach(s => s.el.style.opacity = "");
        }
        this.updateStylesheetOnScroll(toFix, newStickies.length);
    }
}

let hoverFixer = new StickyFixer(
    () => document.body.scrollTop / document.documentElement.clientHeight > 0.15,
    (shouldHide, selectors) => {
        // Opacity is the best way to fix the headers. Setting position to fixed breaks some layouts
        let css = [`${selectors.join(',')} { transition: opacity 0.3s ease-in-out; }`];
        if (shouldHide) {
            // In case the header has animation keyframes involving opacity, set animation to none
            css.push(`${selectors.map(s => s + ':not(:hover)').join(',')} { opacity: 0 !IMPORTANT; animation: none; }`);
        }
        return css;
    });

let headroomFixer = new StickyFixer(
    () => {
        let lastKnownScrollY = this.lastKnownScrollY;
        let currentScrollY = this.lastKnownScrollY = document.body.scrollTop;
        let notOnTop = currentScrollY / document.documentElement.clientHeight > 0.15;
        return notOnTop && (!lastKnownScrollY || currentScrollY >= lastKnownScrollY);
    },
    (shouldHide, selectors) => {
        // Opacity is the best way to fix the headers. Setting position to fixed breaks some layouts
        let css = [`${selectors.join(',')} { transition: opacity 0.3s ease-in-out; }`];
        if (shouldHide) {
            // In case the header has animation keyframes involving opacity, set animation to none
            css.push(`${selectors.join(',')} { opacity: 0 !IMPORTANT; animation: none; }`);
        }
        return css;
    });

function log(...args) {
    if (isDevelopment) {
        console.log("remove headers: ", ...args);
    }
}

log('Script loaded');

function classify(rect) {
    // header, footer, splash, widget, sidebar
    const clientWidth = document.documentElement.clientWidth,
        clientHeight = document.documentElement.clientHeight;

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

function doAll() {
    let activeRomoved = _.partition(exploredStickies, s => document.body.contains(s.el));
    if (activeRomoved[1].length) {
        log("Removed from DOM: ", activeRomoved[1]);
        exploredStickies = activeRomoved[0];
    }
    let newStickies = [];
    if (explorationsLimit) {
        newStickies = explore(exploredStickies);
        exploredStickies = exploredStickies.concat(newStickies);
        log("exploredStickies", exploredStickies);
    }
    if (explorationsLimit > 0 && window.scrollY > document.documentElement.clientHeight) {
        log(`decrement ${explorationsLimit}`);
        explorationsLimit--;
    }
    headroomFixer.updateFixerOnScroll(exploredStickies, newStickies);
}

document.addEventListener('DOMContentLoaded', doAll, false);
window.addEventListener("scroll", _.throttle(doAll, 100), Modernizr.passiveeventlisteners ? {passive: true} : false);
