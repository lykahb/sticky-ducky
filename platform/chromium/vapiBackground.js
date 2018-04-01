(function(self) {
    'use strict';
    let vAPI = self.vAPI = self.vAPI || {};
    let listeners = {};
    let getListeners = name => listeners[name] || (listeners[name] = []);

    vAPI.getSettings = (keys, callback) => chrome.storage.local.get(keys, callback);
    vAPI.updateSettings = settings => chrome.storage.local.set(settings);
    vAPI.closePopup = () => window.close();
    vAPI.onPopupOpen = callback => callback();
    vAPI.sendSettings = () => null;  // Client gets the message from the Storage onChange
    vAPI.listen = (name, listener) => getListeners(name).push(listener);

    chrome.runtime.onMessage.addListener((request, sender) => {
        // The Chromium sendResponse calls the sendMessage callback instead of sending a message
        let sendResponse = (name, message) =>
            chrome.tabs.sendMessage(sender.tab.id, {name: name, message: message});
        getListeners(request.name).map(handler => handler(request.message, sendResponse));
    });
})(this);