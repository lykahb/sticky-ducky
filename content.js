// TODO: do not hide header when it would be regularly shown
// Detect reactive frameworks by listening to mutations
// Create unique CSS path to the element and inject style so that it is not modified
const isDevelopment = true;

let exploredHeaders = [];
let selectorGenerator = new CssSelectorGenerator();
let styleFixElement = null;

function log(...args) {
    if (isDevelopment) {
        console.log("remove headers: ", ...args)
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

        coords = [[middleX, rect.top - 5], [middleX, rect.bottom + 5],
            [rect.left - 5, middleY], [rect.right + 5, middleY], [middleX, middleY]];

    return coords.map(([x, y]) => elementFromPoint(x, y)).filter(Boolean);
}

function fixElementOpacity(els) {
    // Specificity is too low if other classes override opacity
    $(els).addClass("RemoveHeaderExtension");
    // In case the header has animation keyframes involving opacity
    $(els).filter((_, el) => $(el).css("animation")).css("animation", "none");
    // Check if opacity is directly in style
    $(els).filter((_, el) => el.style.opacity).css("opacity", "")
}

function fixElementFixed(els) {
    if (!els.length) {
        return;
    }
    let selectors = els.map(el => selectorGenerator.getSelector(el)),
        css = `${selectors.join(',')} { position: static !IMPORTANT; }`,
        head = document.head || document.getElementsByTagName('head')[0],
        style = document.createElement('style');
    if (styleFixElement) {
        head.removeChild(styleFixElement);
    }
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    styleFixElement = style;
    head.appendChild(style);
}


function doAll() {
    log("scrolled");
    let foundNewInVicinity = false;

    function explore(headers) {
        for (const header of headers) {
            const explored = _.uniq(filterHeaders(exploreInVicinity(header))),
                newHeaders = _.difference(explored, headers);
            if (newHeaders.length > 0) {
                foundNewInVicinity = true;
                headers = headers.concat(newHeaders);
            }
        }

        return headers;
    }

    function filterHeaders(headers) {
        return headers.map(el => el && parentChain(el, isFixed)).filter(Boolean)
    }

    if (exploredHeaders.length === 0) {
        // There may be several fixed headers, one below another, and directly under (z-indexed).
        let topRow = _.range(0, 1, 0.1).map(x => [x, 0.01]),
            bottomRow = _.range(0, 1, 0.1).map(x => [x, 0.95]),
            allCoords = topRow.concat(bottomRow),
            initial = _.uniq(allCoords.map(([x, y]) => elementFromPoint(x, y, true)));
        log(`Checking ${initial.length} elements`);
        exploredHeaders = _.uniq(filterHeaders(initial));
    }
    [exploredHeaders, removed] = _.partition(exploredHeaders, el => document.body.contains(el));
    if (removed.length) {
        log("Removed from DOM: ", removed)
    }

    // explore again
    exploredHeaders = explore(exploredHeaders);

    // Some explored headers are no longer fixed, retain them just in case
    let toFix = exploredHeaders.filter(isFixed).filter(el => classify(el) !== "sidebar");
    fixElementOpacity(toFix);
    log(exploredHeaders);
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