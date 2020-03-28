(function(self) {
    'use strict';
    let vAPI = self.vAPI = self.vAPI || {};
    let listeners = {};
    let getListeners = name => listeners[name] || (listeners[name] = []);
    let isRegistered = false;

    vAPI.sendToBackground = (name, message) => browser.runtime.sendMessage({name: name, message: message});
    vAPI.listen = (name, listener) => getListeners(name).push(listener);

    browser.runtime.onMessage.addListener(request => {
        getListeners(request.name).map(handler => handler(request.message));
    });
    chrome.storage.onChanged.addListener(changes => {
        // Retrieve settings again
        let getSettings = () => {
            vAPI.sendToBackground('getSettings', {location: _.omit(window.location, _.isFunction)});
            isRegistered = false;
        };
        if (!document.hidden) {
            getSettings();
        } else if (!isRegistered) {
            isRegistered = true;
            document.addEventListener("visibilitychange", getSettings, {once: true});
        }
    });
})(this);
