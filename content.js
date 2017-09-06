const isDevelopment = true;
let exploration = {
    // Exploring elements is costly. After some scrolling around, it can be stopped
    limit: 10,
    stylesheets: {
        lastLength: 0,  // Check only the last stylesheet to know if the stylesheets were updated
        lastStylesheet: undefined,
        exploredSheets: [],
        selectors: [],
        processedCounter: 0
    }
};
let lastKnownScrollY = 0;
let exploredStickies = [];
let behavior = null;
let scrollListener = _.throttle(() => doAll(), 300);
let transDuration = 0.2;
let typesToShow = ['sidebar', 'splash', 'hidden'];
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
            let showStyles = [_.pluck(stickies, 'selector').join(',') + `{ transition: opacity ${transDuration}s ease-in-out;}`];
            let css = !stickies.length ? []
                : (shouldHide ? this.hideStyles(selectors, showStyles) : showStyles);
            this.updateStylesheet(css);
            this.hidden = shouldHide;
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

    updateFixerOnScroll(stickies, forceUpdate) {
        let toFix = stickies.filter(s => s.status === 'fixed' && !typesToShow.includes(s.type));
        this.updateStylesheetOnScroll(toFix, forceUpdate);
    }

    destroy() {
        this.stylesheet.ownerNode.remove();
    }
}

let hoverFixer = (fixer) => new StickyFixer(fixer,
    () => window.scrollY / window.innerHeight > 0.1,
    (selectors, showStyles) =>
        [selectors.map(s => s + ':not(:hover)').join(',') + '{ opacity: 0; }'].concat(showStyles));
let scrollFixer = (fixer) => new StickyFixer(fixer,
    () => window.scrollY / window.innerHeight > 0.1 && window.scrollY >= lastKnownScrollY,
    selectors =>
        [selectors.join(',') + `{ opacity: 0; visibility: hidden; animation: none; transition: opacity ${transDuration}s ease-in-out, visibility 0s ${transDuration}s; }`]);
let topFixer = (fixer) => new StickyFixer(fixer,
    () => window.scrollY / window.innerHeight > 0.1,
    selectors =>
        [selectors.join(',') + `{ opacity: 0; visibility: hidden; animation: none; transition: opacity ${transDuration}s ease-in-out, visibility 0s ${transDuration}s; }`]);

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

function classify(el, rect) {
    // TODO: take overflow into account. Use scrollHeight and offsetHeight
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
        || isWide && isTall && 'splash'
        || isTall && isOnSide && 'sidebar'
        || el.scrollHeight === 0 && el.scrollWidth === 0 && 'hidden'
        || 'widget';
}

function explore(stickies) {
    let newStickies = [];
    let allEls = _.pluck(stickies, 'el');
    let isFixed = el => window.getComputedStyle(el).position === 'fixed';
    let makeStickyObj = el => {
        let rect = el.getBoundingClientRect();
        return {
            el: el,
            rect: rect,
            type: classify(el, rect),
            selector: selectorGenerator.getSelector(el),
            status: 'fixed'
        };
    };
    let addExploredEls = els => {
        els = _.difference(els, allEls);
        if (!els.length) return;
        allEls = allEls.concat(els);
        newStickies = newStickies.concat(els.map(makeStickyObj));
    };
    let exploreSelectors = () => {
        let allSelectors = exploration.stylesheets.selectors.slice(0);
        allSelectors.push('*[style*="fixed"]');
        addExploredEls(_.filter(document.body.querySelectorAll(allSelectors.join(',')), isFixed));
    };
    let exploreStylesheets = () => {
        let sheets = exploration.stylesheets;
        if (sheets.lastLength === document.styleSheets.length &&
            sheets.lastStylesheet === document.styleSheets[sheets.lastLength - 1]) {
            return;
        } else {
            sheets.lastLength = document.styleSheets.length;
            sheets.lastStylesheet = document.styleSheets[sheets.lastLength - 1];
        }
        let addSelectors = selectors => {
            selectors.length && (sheets.selectors = sheets.selectors.concat(selectors));
            // Make the selectors unique once all stylesheets are processed
            ++sheets.processedCounter >= document.styleSheets.length && (sheets.selectors = _.uniq(sheets.selectors));
        };
        _.forEach(document.styleSheets, sheet => {
            if (sheets.exploredSheets.includes(sheet)) return;
            if (sheet.cssRules !== null) {
                let selectors = [];
                let traverseRules = rules => _.forEach(rules, rule => {
                    if (rule.type === CSSRule.STYLE_RULE && rule.style.position === 'fixed') {
                        selectors.push(rule.selectorText);
                    } else if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
                        traverseRules(rule.cssRules);
                    }
                });
                traverseRules(sheet.cssRules);
                addSelectors(selectors);
            } else if (sheet.href) {  // Bypass the CORS restrictions
                // TODO: This may cause extra requests. Look into 'only-if-cached' and
                // handle the cases when the stylesheet is already being downloaded for the page.
                fetch(sheet.href, {method: 'GET', cache: 'force-cache'})
                    .then(response => response.ok ? response.text() : Promise.reject('Bad response'))
                    .then(text => {
                        let selectors = [];
                        let traverseRules = rules => _.forEach(rules, rule => {
                            if (rule.type === 'rule' && rule.declarations && rule.selectors.length
                                && rule.declarations.some(dec => dec.type === 'declaration'
                                    && dec.property.toLowerCase() === 'position'
                                    && dec.value.toLowerCase().indexOf('fixed') >= 0)) {
                                selectors = selectors.concat(rule.selectors);
                            } else if (rule.type === 'media' || rule.type === 'supports') {
                                traverseRules(rule.cssRules);
                            }
                        });
                        traverseRules(css_parse(text, true).stylesheet.rules);
                        addSelectors(selectors);
                    })
                    .catch(err => log(`Error downloading stylesheet ${sheet.href}: ${err}`));
            }
            sheets.exploredSheets.push(sheet);
        });
    };
    measure('exploreStylesheets', exploreStylesheets);
    measure('exploreSelectors', exploreSelectors);
    return newStickies;
}

function doAll(forceUpdate) {
    // Do nothing unless scrolled by about 5%
    if (!forceUpdate && Math.abs(lastKnownScrollY - window.scrollY) / window.innerHeight < 0.05) {
        return;
    }
    let newStickies = [];
    if (exploration.limit) {
        newStickies = explore(exploredStickies);
        exploredStickies = exploredStickies.concat(newStickies);
        log("exploredStickies", exploredStickies);
        if (window.scrollY > window.innerHeight) {
            log(`decrement ${exploration.limit}`);
            exploration.limit--;
        }
    }

    let reviewStickies = () => exploredStickies.forEach(s => {
        // An element may be moved elsewhere, removed and returned to DOM later. It tries to recover them by selector.
        let els = document.querySelectorAll(s.selector);
        let isUnique = els.length === 1;
        let isInDOM = document.body.contains(s.el);
        if (isInDOM && !isUnique) {
            s.selector = selectorGenerator.getSelector(s.el);
            forceUpdate = true;
        } else if (!isInDOM && isUnique) {
            s.el = els[0];
        }
        let newStatus = !isInDOM && !isUnique ? 'removed' :
            (window.getComputedStyle(s.el).position === 'fixed' ? 'fixed' : 'unfixed');
        if (newStatus !== s.status) {
            forceUpdate = true;
            s.status = newStatus;
        }
    });
    measure('reviewStickies', reviewStickies);
    stickyFixer.updateFixerOnScroll(exploredStickies, forceUpdate || newStickies.length > 0);
    lastKnownScrollY = window.scrollY;
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