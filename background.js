'use strict';
let settings = {};

// An optimization to cache the parsed rules.
vAPI.getSettings(['whitelist', 'behavior', 'isDevelopment'], settingsResponse => {
    settings = settingsResponse;
    if (settings.whitelist) {
        try {
            settings.whitelist = parseRules(settings.whitelist);
        } catch (e) {
            console.log(e);
        }
    }
    if (!settings.behavior) {
        settings.behavior = DetectIt.deviceType === 'mouseOnly' ? 'hover' : 'scroll';
        vAPI.updateSettings({behavior: settings.behavior});
    }

    vAPI.listen('getSettings', (message, sendResponse) => {
        let response = _.pick(settings, 'behavior', 'isDevelopment');
        if (settings.whitelist) {
            response.whitelist = matchWhitelist(settings.whitelist, message.location);
        }
        sendResponse('settings', response);
    });
});

vAPI.listen('updateSettings', (message, sendResponse) => {
    if (message.whitelist) {
        try {
            settings.whitelist = parseRules(message.whitelist);
        } catch (e) {
            sendResponse('invalidSettings', e.message);
            return;
        }
    }
    vAPI.updateSettings(message);
    _.extend(settings, message);
    // Update all tabs only if the behavior changed.
    if (message.behavior) {
        vAPI.sendSettings({behavior: message.behavior});
    }
    sendResponse('acceptedSettings');
});
vAPI.listen('exploreSheet', (message, sendResponse) => {
    let explorer = new Explorer((...err) => console.log(...err));
    explorer.fetchStylesheet(message.href, message.baseURI);
    // Only the JSON objects can be messaged. So selectors cannot be a Set.
    explorer.wait().then(selectors => {
        sendResponse('sheetExplored', {href: message.href, selectors: selectors})
    });
});