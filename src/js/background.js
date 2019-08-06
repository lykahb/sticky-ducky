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
    // Apply settings to the settings object
    if (message.whitelist) {
        try {
            settings.whitelist = parseRules(message.whitelist);
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
        if (result.href || result.selectors) {
            sendResponse('sheetExplored', result);
        }
    });
    explorer.fetchWrapper(message.href, message.baseURI);
});