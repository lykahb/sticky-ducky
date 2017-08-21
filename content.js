// TODO: do not hide header when it would be regularly shown
// Detect reactive frameworks by listening to mutations
// Create unique CSS path to the element and inject style so that it is not modified
const isDevelopment = true;

let exploredSticky = [];
let selectorGenerator = new CssSelectorGenerator();
let styleFixElement = null;

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

    if (rect.width / clientWidth > 0.25) {
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
        coords = [[middleX, rect.top - 2], [middleX, rect.bottom + 2],
            [rect.left - 2, middleY], [rect.right + 2, middleY], [middleX, middleY]];

    return _.uniq(coords.map(([x, y]) => elementFromPoint(x, y)).filter(Boolean));
}

// Opacity is the best way to fix the headers. Setting position to fixed breaks some layouts
function fixElementOpacity(stickies) {
    // In case the header has animation keyframes involving opacity, set animation to none
    let selectors = stickies.map(s => selectorGenerator.getSelector(s.el)),
        css = [`${selectors.join(',')} { opacity: 0 !IMPORTANT; transition: opacity 0.5s ease-in-out; animation: none; }`,
            `${selectors.map(s => s + ':hover').join(',')} { opacity: 1 !important; }`].join('\n'),
        head = document.head || document.getElementsByTagName('head')[0],
        style = document.createElement('style');
    if (styleFixElement) {
        head.removeChild(styleFixElement);
    }
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    styleFixElement = style;
    head.appendChild(style);
    // Check if opacity is directly in style. DOM changes don't work well with reactive websites
    $(stickies).filter((_, s) => s.el.style.opacity).css("opacity", "")
}

function doAll() {
    log("scrolled");

    function explore(stickies) {
        if (stickies.length === 0) {
            // There may be several fixed headers, one below another, and directly under (z-indexed).
            let topRow = _.range(0, 1, 0.1).map(x => [x, 0.01]),
                bottomRow = _.range(0, 1, 0.1).map(x => [x, 0.95]),
                allCoords = topRow.concat(bottomRow),
                initial = _.uniq(allCoords.map(([x, y]) => elementFromPoint(x, y, true)));
            log(`Checking ${initial.length} elements`);
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

    // TODO: Store old bounding rect since after changing position it is no longer useful
    function filterSticky(els) {
        return _.uniq(els.map(el => el && parentChain(el, isFixed))
            .filter(Boolean))
            .map(el => ({
                el: el,
                isFixed: false,
                type: classify(el)
            }))
    }

    // TODO: removed is a global variable here
    [exploredSticky, removed] = _.partition(exploredSticky, s => document.body.contains(s.el));
    if (removed.length) {
        log("Removed from DOM: ", removed);
    }

    exploredSticky = explore(exploredSticky);

    // Some explored headers are no longer fixed, retain them just in case
    let toFix = exploredSticky.filter(s => s.type !== 'sidebar'),
        fixNeeded = toFix.some(s => !s.isFixed);
    if (fixNeeded) {
        log("Fixing: ", toFix);
        fixElementOpacity(toFix);
        toFix.forEach(s => {
            s.isFixed = true
        })
    }
    log(exploredSticky);
}

if (document.readyState === "interactive" || document.readyState === "complete") {
    doAll();
} else {
    document.addEventListener('DOMContentLoaded', doAll, false);
}

// TODO: repeat doAll on scroll until one screen is scrolled
function onScroll() {
    if (window.scrollY > document.documentElement.clientHeight) {
        // Assume that the dynamic header appeared and was processed once the document has been scrolled far enough
        log("Scrolled far");
        window.removeEventListener("scroll", onScroll, false);
    }
    doAll();
}

window.addEventListener("scroll", onScroll, Modernizr.passiveeventlisteners ? {passive: true} : false);