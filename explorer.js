'use strict';

// This liberal comparison picks up "FiXeD !important" or "-webkit-sticky" positions
let isFixedPos = p => p.toLowerCase().indexOf('fixed') >= 0 || p.toLowerCase().indexOf('sticky') >= 0;

// These functions recursively call each other. It is important both to handle the failures and process
// all rules even after a failure. So the functions return promises that always resolve.

class Explorer {
    constructor(onFetchFail) {
        this.selectors = [];
        this.onFetchFail = onFetchFail;
        this.promises = [];
    }

    wait() {
        return Promise.all(this.promises).then(results => {
            if (this.promises.length > results.length) {
                // If new promises were created, wait for them.
                return this.wait();
            } else {
                return this.selectors;
            }
        });
    }

    exploreRules(rules, baseURI) {
        for (let rule of rules) {
            if (rule.type === CSSRule.STYLE_RULE && isFixedPos(rule.style.position)) {
                this.selectors.push(rule.selectorText);
            } else if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
                this.exploreRules(rule.cssRules, baseURI);
            } else if (rule.type === CSSRule.IMPORT_RULE && rule.styleSheet) {
                this.exploreStylesheet({sheet: rule.styleSheet});
            } else if (rule.type === CSSRule.IMPORT_RULE && rule.href) {
                this.fetchStylesheet(rule.href, baseURI);
            }
        }
    }

    fetchStylesheet(href, baseURI) {
        // Href may be relative, absolute or data url (https://bugs.chromium.org/p/chromium/issues/detail?id=813826)
        let iframe;
        let url = new URL(href, baseURI);
        let promise = fetch(url, {method: 'GET', cache: 'force-cache'})
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
                return this.exploreRules(style.sheet.cssRules, base);
            })
            .catch(err => this.onFetchFail(href, baseURI, err))
            .then(() => iframe && iframe.remove());
        this.promises.push(promise);
    }

    exploreStylesheet(sheetInfo) {
        let sheet = sheetInfo.sheet;
        let cssRules = null;
        try {
            cssRules = sheet.cssRules;
        } catch (e) {
        }
        let baseURI = sheet.ownerNode && sheet.ownerNode.baseURI;
        if (cssRules) {
            sheetInfo.rulesCount = cssRules.length;
            this.exploreRules(cssRules, baseURI);
        } else if (sheet.href) {
            this.fetchStylesheet(sheet.href, baseURI);
        }
    }
}