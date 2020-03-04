'use strict';

let isDataURL = url => /^\s*data:/i.test(url);

// These functions recursively call each other. It is important both to handle the failures and process
// all rules even after a failure. So the functions return promises that always resolve.

class Explorer {
    constructor(onFinish) {
        this.onFinish = onFinish;
    }

    makeSelectorDescriptions(selector, position) {
        if (!selector.includes(':before') && !selector.includes(':after')) {
            return [{selector: selector, position: position}];
        }
        // The selectors with pseudo-elements need to be separated. So in case it is comma-separated, after parsing they are split
        let selectors = CSSWhat.parse(selector);
        // While ::before is correct, the browsers also accept :before.
        let process = subselects => {
            let isPseudo = s => (s.type === 'pseudo' || s.type === 'pseudo-element') && (s.name === 'before' || s.name === 'after');
            let pseudoElement = subselects.filter(isPseudo)[0];
            let selectorNoPseudo = subselects.filter(s => !isPseudo(s));
            return {
                pseudoElement: pseudoElement ? pseudoElement.name : null,
                selector: CSSWhat.stringify([selectorNoPseudo]),
                position: position
            }
        };
        return selectors.map(process);
    }

    exploreRules(sheet, baseURI) {
        // Returns all selectors that were synchronously explored.
        let selectors = [];
        let traverse = rules => {
            for (let rule of rules) {
                if (rule.type === CSSRule.STYLE_RULE) {
                    let position = rule.style.position.toLowerCase();
                    if (position.includes('fixed')) {
                        position = 'fixed';
                    } else if (position.includes('sticky')) {
                        position = 'sticky';
                    } else {
                        continue;
                    }
                    selectors = selectors.concat(this.makeSelectorDescriptions(rule.selectorText, position));
                } else if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
                    traverse(rule.cssRules);
                } else if (rule.type === CSSRule.IMPORT_RULE && rule.styleSheet) {
                    this.exploreStylesheet(rule.styleSheet);
                } else if (rule.type === CSSRule.IMPORT_RULE && rule.href) {
                    this.fetchStylesheet(rule.href, baseURI);
                }
            }
        };

        return this.getCSSRules(sheet).then(cssRules => {
            traverse(cssRules);
            return selectors;
        });
    }

    getBaseURI(sheet, isParent) {
        return isParent && sheet.href && !isDataURL(sheet.href) && sheet.href
            || sheet.ownerNode && sheet.ownerNode.baseURI
            || this.getBaseURI(sheet.parentStyleSheet, true);
    }

    fetchStylesheet(href, baseURI) {
        // Href may be relative, absolute or data url (https://bugs.chromium.org/p/chromium/issues/detail?id=813826)
        let absoluteURL, nestedBaseURI, iframe;
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
                iframe = document.createElement('iframe');
                iframe.style.display = 'none';  // Isolate stylesheet to prevent reflow
                document.body.appendChild(iframe);
                let iframeDoc = iframe.contentDocument;
                // We need base for @import with relative urls. BaseURI may be on a different domain than href.
                iframeDoc.head.appendChild(iframeDoc.createElement('base')).href = nestedBaseURI;
                let style = iframeDoc.head.appendChild(iframeDoc.createElement('style'));
                style.textContent = text;
                return this.exploreRules(style.sheet, absoluteURL);
            })
            .then(selectors => this.onFinish({status: 'success', selectors: selectors, href: href, baseURI: baseURI}))
            .catch(err => this.onFinish({status: 'fail', error: String(err), href: href, baseURI: baseURI}))
            .finally(() => {
                if (iframe) iframe.remove();
            });
    }

    getCSSRules(sheet) {
        // There is an issue in Firefox that throws InvalidAccessError on stylesheet access until it is fully loaded.
        // It may even happen after then iframe load event, so timeouts are to rescue.
        return new Promise((resolve, reject) => {
            let retryCounter = 0;
            let tryIt = () => {
                try {
                    return resolve(sheet.cssRules);
                } catch (e) {
                    if (e.name === 'InvalidAccessError' && retryCounter++ < 3) {
                        retryCounter++;
                        setTimeout(tryIt, 500);
                    } else {
                        // Likely this is SecurityError that may appear if stylesheet is on another domain.
                        reject(e);
                    }
                }
            };
            tryIt();
        });
    }

    exploreStylesheet(sheet) {
        let baseURI = sheet.href ? this.getBaseURI(sheet, false) : null;
        this.exploreRules(sheet, baseURI)
            .then(selectors => {
                if (sheet.href) {
                    this.onFinish({status: 'success', selectors: selectors, href: sheet.href, baseURI: baseURI});
                } else {
                    this.onFinish({status: 'success', selectors: selectors});
                }
            })
            .catch(e => {
                if (sheet.href) {
                    this.fetchStylesheet(sheet.href, baseURI);
                } else {
                    this.onFinish({status: 'fail', error: `No href. Rules exploration failed with ${e}`});
                }
            });
    }
}
