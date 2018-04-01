'use strict';

// This liberal comparison picks up "FiXeD !important" or "-webkit-sticky" positions
let isFixedPos = p => p.toLowerCase().indexOf('fixed') >= 0 || p.toLowerCase().indexOf('sticky') >= 0;

// These functions recursively call each other. It is important both to handle the failures and process
// all rules even after a failure. So the functions return promises that always resolve.

function exploreRules(set, rules, baseURI, onFetchFail) {
    let promise = Promise.resolve(set);
    _.forEach(rules, rule => {
        if (rule.type === CSSRule.STYLE_RULE && isFixedPos(rule.style.position)) {
            set.add(rule.selectorText);
        } else if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
            promise = promise.then(() => exploreRules(set, rule.cssRules, baseURI, onFetchFail));
        } else if (rule.type === CSSRule.IMPORT_RULE && rule.styleSheet) {
            promise = promise.then(() => exploreStylesheet(set, {sheet: rule.styleSheet}, onFetchFail));
        } else if (rule.type === CSSRule.IMPORT_RULE && rule.href) {
            promise = promise.then(() => fetchStylesheet(set, rule.href, baseURI, onFetchFail));
        }
    });
    return promise;
}

function fetchStylesheet(set, href, baseURI, onFetchFail) {
    // Href may be relative, absolute or data url (https://bugs.chromium.org/p/chromium/issues/detail?id=813826)
    let iframe;
    let url = new URL(href, baseURI);
    return fetch(url, {method: 'GET', cache: 'force-cache'})
        .then(response => response.ok ? response.text() : Promise.reject('Bad response'))
        .then(text => {
            iframe = document.createElement('iframe');
            iframe.style.display = 'none';  // Isolate stylesheet to prevent reflow
            document.body.appendChild(iframe);
            let iframeDoc = iframe.contentDocument;
            // We need base for @import with relative urls. BaseURI may be on a different domain than href.
            let base = url.protocol === 'data:' ? baseURI : url.href;
            iframeDoc.head.appendChild(iframeDoc.createElement('base')).href = base;
            let style = iframeDoc.head.appendChild(iframeDoc.createElement('style'));
            style.textContent = text;
            return exploreRules(set, style.sheet.cssRules, base, onFetchFail);
        })
        .catch(err => onFetchFail(href, baseURI, err))
        .then(() => {
            if (iframe) iframe.remove();
            return set;
        })
}

function exploreStylesheet(set, sheetInfo, onFetchFail) {
    let sheet = sheetInfo.sheet;
    let cssRules = null;
    try {
        cssRules = sheet.cssRules;
    } catch (e) {
    }
    let baseURI = sheet.ownerNode && sheet.ownerNode.baseURI;
    if (cssRules) {
        sheetInfo.rulesCount = cssRules.length;
        return exploreRules(set, cssRules, baseURI, onFetchFail);
    } else if (sheet.href) {
        return fetchStylesheet(set, sheet.href, baseURI, onFetchFail);
    }
}