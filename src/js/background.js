'use strict';

// Import libraries at the top (service worker supports importScripts)
importScripts('lib/underscore.js', 'lib/css-what.js');

// Consolidated background service worker for Manifest V3
let settings = {};

// Service worker initialization
chrome.runtime.onStartup.addListener(() => {
    initializeSettings();
});

chrome.runtime.onInstalled.addListener(() => {
    initializeSettings();
});

function initializeSettings() {
    chrome.storage.local.get(['whitelist', 'behavior', 'isDevelopment'], (result) => {
        settings = result;

        settings.parsedWhitelist = [];
        if (settings.whitelist) {
            try {
                settings.parsedWhitelist = parseRules(settings.whitelist);
            } catch (e) {
                console.error(e);
            }
        }
        if (!settings.behavior) {
            // Assume that devices without touch have a mouse
            // Note: In service worker, we don't have access to window, so we'll default to 'hover'
            settings.behavior = 'hover';
            chrome.storage.local.set({behavior: settings.behavior});
        }
    });
}

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    handleMessage(request, sender, sendResponse);
    return true; // Keep channel open for async responses
});

function handleMessage(request, sender, sendResponse) {
    switch(request.name) {
        case 'getSettings':
            handleGetSettings(request.message, sendResponse);
            break;
        case 'updateSettings':
            handleUpdateSettings(request.message, sendResponse);
            break;
        case 'exploreSheet':
            handleExploreSheet(request.message, sendResponse);
            break;
        case 'addToWhitelist':
            handleAddToWhitelist(request.message, sendResponse);
            break;
    }
}

function handleGetSettings(message, sendResponse) {
    let response = _.pick(settings, 'behavior', 'isDevelopment');
    if (settings.parsedWhitelist) {
        response.whitelist = matchWhitelist(settings.parsedWhitelist, message.location);
    }
    sendResponse({name: 'settings', message: response});
}

function handleUpdateSettings(message, sendResponse) {
    // Apply settings to the settings object
    if (message.whitelist !== undefined) {
        try {
            settings.parsedWhitelist = parseRules(message.whitelist);
            settings.whitelist = message.whitelist;
        } catch (e) {
            sendResponse({name: 'invalidSettings', message: e.message});
            return;
        }
    }
    if (message.behavior) {
        settings.behavior = message.behavior;
    }

    chrome.storage.local.set(message);

    // Update all tabs only if the behavior changed.
    if (message.behavior) {
        sendSettingsToAllTabs({behavior: message.behavior});
    }
    sendResponse({name: 'acceptedSettings'});
}

function handleExploreSheet(message, sendResponse) {
    let explorer = new Explorer(result => {
        sendResponse({name: 'sheetExplored', message: result});
    });
    explorer.fetchStylesheet(message.href, message.baseURI);
}

function handleAddToWhitelist(message, sendResponse) {
    let url = null;
    try {
        url = new URL(message.url);
    } catch (e) {
    }
    if (!url || !url.hostname) {
        sendResponse({name: 'addToWhitelistError', message: {error: 'Invalid URL'}});
        return;
    }
    let existingRule = settings.parsedWhitelist.find(rule => rule.domain === url.hostname);
    if (existingRule) {
        sendResponse({name: 'addToWhitelistError', message: {error: 'The URL already exists in the whitelist'}});
        return;
    }

    // This really should be encapsulated in the whitelist module.
    if (!settings.whitelist) {
        settings.whitelist = '||' + url.hostname;
    } else {
        settings.whitelist = settings.whitelist + '\n||' + url.hostname;
    }
    settings.parsedWhitelist = parseRules(settings.whitelist);
    chrome.storage.local.set({whitelist: settings.whitelist});
    sendResponse({name: 'addToWhitelistSuccess'});
}

function sendSettingsToAllTabs(settingsToSend) {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            try {
                chrome.tabs.sendMessage(tab.id, {name: 'settingsUpdate', message: settingsToSend});
            } catch (e) {
                console.error(e);
            }
        });
    });
}

// === WHITELIST FUNCTIONALITY ===

function parseRules(whitelist) {
    // Testcase hearthpwn.com###db-tooltip-container
    let rules = [];
    let assert = (isValid, message) => {
        if (!isValid) throw Error(message)
    };
    let parseURLMatcher = pattern => {
        assert(pattern, 'Pattern must not be empty');
        if (pattern.startsWith('||')) {
            let domain = pattern.slice(2);
            assert(domain, 'Domain must not be empty');
            return {domain: domain};
        } else if (pattern.startsWith('|') && pattern.endsWith('|')) {
            let exactAddress = pattern.slice(1, pattern.length - 1);
            assert(exactAddress, 'Exact address must not be empty');
            return {exactAddress: exactAddress};
        } else {
            return {addressPart: pattern};
        }
    };

    whitelist.split('\n').forEach((line, index) => {
        line = line.trim();
        if (!line || line.startsWith('!')) return;

        try {
            let selectorIndex = line.indexOf('##');
            let rule = {};
            if (selectorIndex > 0) {
                rule = parseURLMatcher(line.slice(0, selectorIndex));
                rule.selector = line.slice(selectorIndex + 2);
                assert(rule.selector, 'Selector must not be empty');
                assert(canSelectorBeUsed(rule.selector), `Invalid selector ${rule.selector}\nSelectors must be simple`);
            } else {
                rule = parseURLMatcher(line);
            }
            rules.push(rule);
        } catch (e) {
            throw Error(`Error on line ${index+1}: ${e.message}`);
        }
    });
    return rules;
}

function isWhitelistRuleMatch(rule, location) {
    let noHash = location.href;
    let containsDomain = rule => {
        if (!location.hostname.endsWith(rule.domain)) return false;
        if (location.hostname.length === rule.domain.length) {
            return true;
        } else if (location.hostname[location.hostname.length - rule.domain.length - 1] === '.') {
            // The hostname is a subdomain of a rule domain
            return true;
        }
        return false;
    };
    if (location.hash) {
        noHash = location.href.slice(0, location.href.length - location.hash.length);
    }
    return (
        rule.href && (rule.exactAddress === location.href || rule.exactAddress === noHash)  // Exact match
        || rule.domain && containsDomain(rule)  //Domain
        || rule.addressPart && location.href.includes(rule.addressPart)  // Anywhere in the address
    );
}

function matchWhitelist(whitelist, location) {
    let selectors = [];
    let type = 'none';
    for (let rule of whitelist) {
        if (isWhitelistRuleMatch(rule, location)) {
            if (rule.selector) {
                type = 'selectors';
                selectors.push(rule.selector);
            } else {
                type = 'page';
                break;
            }
        }
    }

    let result = {
        'type': type,
    };
    if (type === 'selectors') {
        result.selectors = selectors;
    }
    return result;
}

function canSelectorBeUsed(selector) {
    // In service worker, we don't have access to document
    // This validation will need to be done in content script if needed
    try {
        // Basic syntax validation using CSS-what parser
        CSSWhat.parse(selector);
        return true;
    } catch (e) {
        return false;
    }
}

// === EXPLORER FUNCTIONALITY ===

let isDataURL = url => /^\s*data:/i.test(url);

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
        // Note: In service worker, we can't access DOM directly
        // This method needs to be reworked for service worker context
        // For now, we'll return an error as this functionality 
        // should be handled by content scripts in V3
        
        this.onFinish({
            status: 'fail', 
            error: 'Stylesheet fetching not supported in service worker context',
            href: href, 
            baseURI: baseURI
        });
        
        return Promise.resolve();
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