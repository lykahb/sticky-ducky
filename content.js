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
        $(stickies).filter((_, s) => s.el.style.opacity).css("opacity", "")
    }

    updateStylesheetOnscroll(stickies) {
        // In case the header has animation keyframes involving opacity, set animation to none
        let selectors = stickies.map(s => s.selector || (s.selector = this.selectorGenerator.getSelector(s.el)));
        let shouldHide = document.body.scrollTop / document.documentElement.clientHeight > 0.25;
        if (shouldHide !== this.hidden || stickies.some(s => !s.isFixed)) {
            let css = shouldHide ?
                [`${selectors.join(',')} { opacity: 0 !IMPORTANT; animation: none; transition: opacity 0.3s ease-in-out; }`,
                    `${selectors.map(s => s + ':hover').join(',')} { opacity: 1 !IMPORTANT; }`] :
                [`${selectors.join(',')} { opacity: 1 !IMPORTANT; animation: none; transition: opacity 0.3s ease-in-out; }`];
            this.updateStylesheet(css);
            stickies.forEach(s => {
                s.isFixed = true;
            });
        }
        this.hidden = shouldHide;
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

    updateFixerOnScroll(stickies) {
        let toFix = exploredSticky.filter(s => s.type !== 'sidebar'),
            fixNeeded = toFix.some(s => !s.isFixed);
        if (fixNeeded) {
            this.fixElementOpacity(toFix);
        }
        this.updateStylesheetOnscroll(stickies);
    }
}

let exploredSticky = [];
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

function classify(el) {
    // header, footer, splash, widget, sidebar
    const rect = el.getBoundingClientRect(),
        clientWidth = document.documentElement.clientWidth,
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

function exploreInVicinity(el) {
    const rect = el.getBoundingClientRect(),
        middleX = rect.left + rect.width / 2,
        middleY = rect.top + rect.height / 2,
        // TODO: use more dense samples
        coords = [[middleX, rect.top - 5], [middleX, rect.bottom + 5],
            [rect.left - 5, middleY], [rect.right + 5, middleY], [middleX, middleY]];

    return _.uniq(coords.map(([x, y]) => elementFromPoint(x, y)).filter(Boolean));
}

function explore(stickies) {
    function filterSticky(els) {
        return _.uniq(els.map(el => el && parentChain(el, isFixed))
            .filter(Boolean))
            .map(el => ({
                el: el,
                isFixed: false,
                type: classify(el)
            }))
    }

    if (stickies.length === 0) {
        // There may be several fixed headers, one below another, and directly under (z-indexed).
        let topRow = _.range(0, 1, 0.1).map(x => [x, 0.01]),
            bottomRow = _.range(0, 1, 0.1).map(x => [x, 0.95]),
            allCoords = topRow.concat(bottomRow),
            initial = _.uniq(allCoords.map(([x, y]) => elementFromPoint(x, y, true)));
        log(`Checking ${initial.length} elements`, initial);
        stickies = filterSticky(initial);
    }

    let allEls = _.pluck(stickies, 'el');
    for (let i = 0; i < stickies.length; i++) {
        let explored = filterSticky(exploreInVicinity(stickies[i].el))
            .filter(s => !allEls.includes(s.el));
        if (explored.length > 0) {
            allEls = allEls.concat(_.pluck(explored, 'el'));
            stickies = stickies.concat(explored);
        }
    }
    return stickies;
}

function doAll() {
    let activeRomoved = _.partition(exploredSticky, s => document.body.contains(s.el));
    if (activeRomoved[1].length) {
        log("Removed from DOM: ", activeRomoved[1]);
        exploredSticky = activeRomoved[0];
    }
    if (explorationsLimit) {
        exploredSticky = explore(exploredSticky);
    }
    if (window.scrollY > document.documentElement.clientHeight) {
        explorationsLimit--;
    }
    stickyFixer.updateFixerOnScroll(exploredSticky);
    log("exploredSticky", exploredSticky);
}

document.addEventListener('DOMContentLoaded', doAll, false);

// TODO: repeat doAll on scroll until one screen is scrolled
function onScroll() {

    doAll();
}

window.addEventListener("scroll", onScroll, Modernizr.passiveeventlisteners ? {passive: true} : false);