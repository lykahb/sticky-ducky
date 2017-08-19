// TODO: do not hide header when it would be regularly shown
// Detect reactive frameworks by listening to mutations
// Create unique CSS path to the element and inject style so that it is not modified
var isDevelopment = true;

var exploredHeaders = [];

function log(...args) {
    if (isDevelopment) {
        console.log("remove headers: ", ...args)
    }
}

log('Script loaded')

function isFixed(el) {
    return window.getComputedStyle(el).position == "fixed";
}

function classify(el) {
    // header, footer, splash, widget, sidebar
    var rect = el.getBoundingClientRect();
    var clientWidth = document.documentElement.clientWidth;
    var clientHeight = document.documentElement.clientHeight;

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
    if (el.tagName != "HTML") {
        while (el.tagName != "BODY") {
            if (pred(el)) {
                return el;
            }
            el = el.parentNode;
        }
    }
}

function exploreInVicinity(el) {
    var rect = el.getBoundingClientRect();
    var middleX = rect.left + rect.width / 2;
    var middleY = rect.top + rect.height / 2;

    var coords = [[middleX, rect.top - 5], [middleX, rect.bottom + 5],
        [rect.left - 5, middleY], [rect.right + 5, middleY], [middleX, middleY]];

    return coords.map(([x, y]) => elementFromPoint(x, y)).filter(Boolean);
}

function fixElementOpacity(el) {
    // Specificity is too low if other classes override opacity
    $(el).addClass("RemoveHeaderExtension");
    // In case the header has animation keyframes involving opacity
    if ($(el).css("animation")) {
        $(el).css("animation", "none");
    }
    // Check if opacity is directly in style
    if (el.style.opacity) {
        $(el).css("opacity", "");
    }
}

function doAll() {
    log("scrolled")
    var foundNewInVicinity = false;

    function explore(headers) {
        for (var i = 0; i < headers.length; i++) {
            var header = headers[i];
            var explored = _.uniq(filterHeaders(exploreInVicinity(header)));
            var newHeaders = _.difference(explored, headers)
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

    if (exploredHeaders.length == 0) {
        // There may be several fixed headers, one below another, and directly under (z-indexed).
        var topRow = _.range(0, 1, 0.1).map(x => [x, 0.01]);
        var bottomRow = _.range(0, 1, 0.1).map(x => [x, 0.95]);
        var allCoords = topRow.concat(bottomRow);
        var initial = _.uniq(allCoords.map(([x, y]) => elementFromPoint(x, y, true)));
        log("Checking " + initial.length + " elements")
        exploredHeaders = filterHeaders(initial);
    }
    [exploredHeaders, removed] = _.partition(exploredHeaders, el => document.body.contains(el));
    if (removed.length) {
        log("Removed from DOM: ", removed)
    }

    // explore again
    exploredHeaders = explore(exploredHeaders);

    // Some explored headers are no longer fixed, retain them just in case
    exploredHeaders.filter(isFixed).filter(el => classify(el) != "sidebar").forEach(fixElementOpacity);
    log(exploredHeaders);
}

if (document.readyState == "interactive" || document.readyState == "complete") {
    doAll();
} else {
    document.addEventListener('DOMContentLoaded', doAll, false);
}

// TODO: repeat doAll on scroll until one screen is scrolled
function onScroll(e) {
    if (window.scrollY > document.documentElement.clientHeight) {
        // Assume that the dynamic header appeared and was processed once the document has been scrolled far enough
        log("Scrolled far")
        window.removeEventListener("scroll", onScroll, false);
    }
    doAll();
}

window.addEventListener("scroll", onScroll, Modernizr.passiveeventlisteners ? {passive: true} : false);