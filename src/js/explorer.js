'use strict';

// This liberal comparison picks up "FiXeD !important" or "-webkit-sticky" positions
let isFixedPos = p => p.toLowerCase().indexOf('fixed') >= 0 || p.toLowerCase().indexOf('sticky') >= 0;

let isDataURL = url => /^\s*data:/i.test(url);

// These functions recursively call each other. It is important both to handle the failures and process
// all rules even after a failure. So the functions return promises that always resolve.

class Explorer {
    constructor(onFinish) {
        this.selectors = [];
        this.onFinish = onFinish;
    }

    exploreRules(rules) {
        // Returns all selectors that were synchronously explored.
        let selectors = [], self = this;
        function traverse(rules) {
            for (let rule of rules) {
                if (rule.type === CSSRule.STYLE_RULE && isFixedPos(rule.style.position)) {
                    selectors.push(rule.selectorText);
                } else if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
                    traverse(rule.cssRules);
                } else if (rule.type === CSSRule.IMPORT_RULE && rule.styleSheet) {
                    self.exploreStylesheet(rule.styleSheet);
                } else if (rule.type === CSSRule.IMPORT_RULE && rule.href) {
                    self.fetchWrapper(rule.href, self.getBaseURI(rule.parentStyleSheet, false));
                }
            }
        }
        traverse(rules);
        this.selectors.push(...selectors);
        return selectors;
    }

    getBaseURI(sheet, isParent) {
        return isParent && sheet.href && !isDataURL(sheet.href) && sheet.href
            || sheet.ownerNode && sheet.ownerNode.baseURI
            || this.getBaseURI(sheet.parentStyleSheet, true);
    }

    fetchStylesheet(href, baseURI) {
        // Href may be relative, absolute or data url (https://bugs.chromium.org/p/chromium/issues/detail?id=813826)
        let absoluteURL, nestedBaseURI;
        if (isDataURL(href)) {
            [absoluteURL, nestedBaseURI] = [href, baseURI];
        } else {
            absoluteURL = nestedBaseURI = new URL(href, baseURI).href;
        }
        return fetch(absoluteURL, {method: 'GET', cache: 'force-cache'})
            .then(response => response.ok ?
                response.text() :
                Promise.reject(`${response.status}, ${response.statusText}`))
            .then(text => {
                let iframe = document.createElement('iframe');
                try {
                    iframe.style.display = 'none';  // Isolate stylesheet to prevent reflow
                    document.body.appendChild(iframe);
                    let iframeDoc = iframe.contentDocument;
                    // We need base for @import with relative urls. BaseURI may be on a different domain than href.
                    iframeDoc.head.appendChild(iframeDoc.createElement('base')).href = nestedBaseURI;
                    let style = iframeDoc.head.appendChild(iframeDoc.createElement('style'));
                    style.textContent = text;
                    return this.exploreRules(style.sheet.cssRules);
                } finally {
                    if (iframe) iframe.remove();
                }
            });
    }

    fetchWrapper(href, baseURI) {
        this.fetchStylesheet(href, baseURI)
            .then(selectors => this.onFinish({status: 'success', href: href, baseURI: baseURI, selectors: selectors}))
            .catch(err => this.onFinish({status: 'fail', href: href, baseURI: baseURI, error: err}));
    }

    exploreStylesheet(sheet) {
        let cssRules = null,
            baseURI = sheet.href ? this.getBaseURI(sheet, false) : null;
        try {
            cssRules = sheet.cssRules;
        } catch (e) {
        }
        if (cssRules) {
            let selectors = this.exploreRules(cssRules);
            if (sheet.href) {
                this.onFinish({status: 'success', href: sheet.href, baseURI: baseURI, selectors: selectors});
            } else if (selectors) {
                this.onFinish({status: 'success', selectors: selectors});
            }
        } else if (sheet.href) {
            this.fetchWrapper(sheet.href, baseURI);
        } else {
            this.onFinish({status: 'fail', error: 'Sheet does not have href or rules'});
        }
    }
}
