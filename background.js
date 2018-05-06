'use strict';
vAPI.listen('getSettings', (message, sendResponse) =>
    vAPI.getSettings(['behavior', 'isDevelopment'], settings => {
        sendResponse('settings', settings)
    }));
vAPI.listen('exploreSheet', (message, sendResponse) => {
    let explorer = new Explorer((...err) => console.log(...err));
    explorer.fetchStylesheet(message.href, message.baseURI);
    // Only the JSON objects can be messaged. So Set is not an option
    explorer.wait().then(selectors => {
        sendResponse('sheetExplored', {href: message.href, selectors: selectors})
    });
});