(function(self) {
    'use strict';
    let vAPI = self.vAPI = self.vAPI || {};
    let listeners = {};
    let getListeners = name => listeners[name] || (listeners[name] = []);

    vAPI.getSettings = (keys, callback) => callback(_.pick(safari.extension.settings, keys));
    vAPI.updateSettings = settings => _.extend(safari.extension.settings, settings);
    vAPI.onPopupOpen = callback => safari.application.addEventListener("popover", callback, true);
    vAPI.sendSettings = function(message) {
        safari.application.browserWindows.map(window => window.tabs.map(tab => {
            tab.page.dispatchMessage('settingsChanged', message);
        }));
    };
    vAPI.listen = (name, listener) => getListeners(name).push(listener);
    vAPI.sendToBackground = function(name, message) {
        let gw = safari.extension.globalPage.contentWindow;
        gw.postMessage({name: name, message: message}, window.location.origin);
    };

    safari.application.addEventListener('message', e => {
        let sendResponse = (name, message) => e.target.page.dispatchMessage(name, message);
        getListeners(e.name).map(handler => handler(e.message, sendResponse));
    }, false);

    // For communication with popover
    window.addEventListener('message', function (msg) {
        if (msg.origin === window.location.origin) {
            let sendResponse = (name, message) =>
                msg.source.postMessage({name: name, message: message}, window.location.origin);
            getListeners(msg.data.name).map(handler => handler(msg.data.message, sendResponse));
        }
    }, false);
})(this);
