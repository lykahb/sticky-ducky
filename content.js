// TODO: do not hide header when it would be regularly shown
// Options: show on hover, show on scroll up (Headroom), hide
const isDevelopment = true;
// Exploring elements is costly. After some scrolling around, it can be stopped
let explorationsLimit = 2;

class StickyFixer {
    constructor() {
        this.selectorGenerator = new CssSelectorGenerator();
        this.stylesheet = null;
        this.hidden = false;
    }

    // Opacity is the best way to fix the headers. Setting position to fixed breaks some layouts
    fixElementOpacity(stickies) {
        log("Fixing: ", stickies);
        // Check if opacity is directly in style. DOM changes don't work well with reactive websites
        stickies.filter(s => s.el.style.opacity).forEach(s => s.el.style.opacity = "");
    }

    updateStylesheetOnscroll(stickies, forceUpdate) {
        // In case the header has animation keyframes involving opacity, set animation to none
        let selectors = stickies.map(s => s.selector || (s.selector = this.selectorGenerator.getSelector(s.el)));
        let shouldHide = document.body.scrollTop / document.documentElement.clientHeight > 0.15;
        if (forceUpdate || selectors.length && shouldHide !== this.hidden) {
            let css = shouldHide ?
                [`${selectors.join(',')} { opacity: 0 !IMPORTANT; animation: none; transition: opacity 0.3s ease-in-out; }`,
                    `${selectors.map(s => s + ':hover').join(',')} { opacity: 1 !IMPORTANT; }`] :
                [`${selectors.join(',')} { opacity: 1 !IMPORTANT; animation: none; transition: opacity 0.3s ease-in-out; }`];
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

    updateFixerOnScroll(stickies, newFound) {
        let toFix = stickies.filter(s => s.type !== 'sidebar');
        if (newFound) {
            this.fixElementOpacity(toFix);
        }
        this.updateStylesheetOnscroll(toFix, newFound);
    }
}

let exploredStickies = [];
let stickyFixer = new StickyFixer();

function log(...args) {
    if (isDevelopment) {
        console.log("remove headers: ", ...args);
    }
}

log('Script loaded');

function isFixed(el) {
    return window.getComputedStyle(el).position === "fixed";
}

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

function parentChain(el, pred) {
    if (el.tagName !== "HTML") {
        while (el.tagName !== "BODY") {
            if (pred(el)) {
                return el;
            }
            el = el.parentNode;
        }
    }
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
    let filterSticky = els => _.uniq(els.map(el => el && parentChain(el, isFixed)).filter(Boolean));
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
    stickyFixer.updateFixerOnScroll(exploredStickies, newStickies.length > 0);
}

document.addEventListener('DOMContentLoaded', doAll, false);
window.addEventListener("scroll", doAll, Modernizr.passiveeventlisteners ? {passive: true} : false);