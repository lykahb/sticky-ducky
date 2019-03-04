(function(self) {
    'use strict';
    let vAPI = self.vAPI = self.vAPI || {};
    let listeners = {};
    let getListeners = name => listeners[name] || (listeners[name] = []);

    vAPI.getSettings = (keys, callback) => browser.storage.local.get(keys, callback);
    vAPI.updateSettings = settings => browser.storage.local.set(settings);
    vAPI.onPopupOpen = callback => callback();
    vAPI.sendSettings = () => null;  // Client gets the message from the Storage onChange
    vAPI.listen = (name, listener) => getListeners(name).push(listener);
    vAPI.sendToBackground = (name, message) => browser.runtime.sendMessage({name: name, message: message});

    browser.runtime.onMessage.addListener((request, sender) => {
        let sendResponse = (name, message) => {
            if (sender.tab && sender.tab.id) {
                browser.tabs.sendMessage(sender.tab.id, {name: name, message: message});
            } else {
                // Respond to popup
                browser.runtime.sendMessage({name: name, message: message});
            }
        };
        getListeners(request.name).map(handler => handler(request.message, sendResponse));
    });
})(this);
