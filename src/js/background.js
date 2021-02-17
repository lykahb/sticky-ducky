'use strict';
let settings = {};

// An optimization to cache the parsed rules.
vAPI.getSettings(['whitelist', 'behavior', 'isDevelopment'], settingsResponse => {
    settings = settingsResponse;
    if (settings.whitelist) {
        try {
            settings.parsedWhitelist = parseRules(settings.whitelist);
        } catch (e) {
            console.error(e);
        }
    }
    if (!settings.behavior) {
        // Assume that devices without touch have a mouse
        const hasTouch = 'ontouchstart' in window;
        settings.behavior = hasTouch ? 'scroll' : 'hover';
        vAPI.updateSettings({behavior: settings.behavior});
    }

    vAPI.listen('getSettings', (message, sendResponse) => {
        let response = _.pick(settings, 'behavior', 'isDevelopment');
        if (settings.parsedWhitelist) {
            response.whitelist = matchWhitelist(settings.parsedWhitelist, message.location);
        }
        sendResponse('settings', response);
    });
});

vAPI.listen('updateSettings', (message, sendResponse) => {
    // Apply settings to the settings object
    if (message.whitelist) {
        try {
            settings.parsedWhitelist = parseRules(message.whitelist);
            settings.whitelist = message.whitelist;
        } catch (e) {
            // TODO: replace with promise
            sendResponse('invalidSettings', e.message);
            return;
        }
    }
    if (message.behavior) {
        settings.behavior = message.behavior;
    }

    vAPI.updateSettings(message);

    // Update all tabs only if the behavior changed.
    if (message.behavior) {
        vAPI.sendSettings({behavior: message.behavior});
    }
    // TODO: replace with promise
    sendResponse('acceptedSettings');
});
vAPI.listen('exploreSheet', (message, sendResponse) => {
    let explorer = new Explorer(result => {
        sendResponse('sheetExplored', result);
    });
    explorer.fetchStylesheet(message.href, message.baseURI);
});
vAPI.listen('addToWhitelist', (message, sendResponse) => {
    let url = null;
    try {
        url = new URL(message.url);
    } catch (e) {
    }
    if (!url || !url.hostname) {
        sendResponse('addToWhitelistError', {error: 'Invalid URL'});
        return;
    }
    let existingRule = settings.parsedWhitelist.find(rule => rule.domain == url.hostname);
    if (existingRule) {
        sendResponse('addToWhitelistError', {error: 'The URL already exists in the whitelist'});
        return;
    }
    // This really should be encapsulated in the whitelist module.
    settings.whitelist = settings.whitelist + '\n||' + url.hostname;
    settings.parsedWhitelist = parseRules(settings.whitelist);
    vAPI.updateSettings({whitelist: settings.whitelist});
    sendResponse('addToWhitelistSuccess');
});