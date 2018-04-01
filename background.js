'use strict';
vAPI.listen('getSettings', (message, sendResponse) =>
    vAPI.getSettings(['behavior', 'isDevelopment'], settings => {
        sendResponse('settings', settings)
    }));
vAPI.listen('exploreSheet', (message, sendResponse) =>
    fetchStylesheet(new Set(), message.href, message.baseURI, (...err) => console.log(...err))
        .then(set => {
            sendResponse('sheetExplored', {href: message.href, selectors: set})
        }));