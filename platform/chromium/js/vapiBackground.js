(function(self) {
    'use strict';
    let vAPI = self.vAPI = self.vAPI || {};
    let listeners = {};
    let getListeners = name => listeners[name] || (listeners[name] = []);

    vAPI.getSettings = (keys, callback) => chrome.storage.local.get(keys, callback);
    vAPI.updateSettings = settings => chrome.storage.local.set(settings);
    vAPI.onPopupOpen = callback => callback();
    vAPI.sendSettings = () => null;  // Client gets the message from the Storage onChange
    vAPI.listen = (name, listener) => getListeners(name).push(listener);
    vAPI.sendToBackground = (name, message) => chrome.runtime.sendMessage({name: name, message: message});
    vAPI.sendToTabs = (tabs, name, message) => {
        tabs.forEach(tab => {
            try {
                chrome.tabs.sendMessage(tab.id, {name: name, message: message});
            } catch (e) {
                console.error(e);
            }
        });
    };
    vAPI.getCurrentTabs = () => new Promise ((resolve) => {
        chrome.tabs.query({currentWindow: true, active: true}, resolve)
    });

    chrome.runtime.onMessage.addListener((request, sender) => {
        // The Chromium sendResponse calls the sendMessage callback instead of sending a message
        let sendResponse = (name, message) => {
            if (sender.tab && sender.tab.id) {
                chrome.tabs.sendMessage(sender.tab.id, {name: name, message: message});
            } else {
                // Respond to popup
                chrome.runtime.sendMessage({name: name, message: message});
            }
        };
        getListeners(request.name).map(handler => handler(request.message, sendResponse));
    });
})(this);
