(function(self) {
    'use strict';
    let vAPI = self.vAPI = self.vAPI || {};
    let listeners = {};
    let getListeners = name => listeners[name] || (listeners[name] = []);

    vAPI.getSettings = (keys, callback) => callback(_.pick(safari.extension.settings, keys));
    vAPI.updateSettings = settings => _.extend(safari.extension.settings, settings);
    vAPI.closePopup = function() {
        let popover = safari.extension.popovers[0];
        if (popover) popover.hide();
    };
    vAPI.onPopupOpen = callback => safari.application.addEventListener("popover", callback, true);
    vAPI.sendSettings = function(message) {
        safari.application.browserWindows.map(window => window.tabs.map(tab => {
            tab.page.dispatchMessage('settingsChanged', message);
        }));
    };
    vAPI.listen = (name, listener) => getListeners(name).push(listener);

    safari.application.addEventListener('message', e => {
        let sendResponse = (name, message) => e.target.page.dispatchMessage(name, message);
        getListeners(e.name).map(handler => handler(e.message, sendResponse));
    }, false);
})(this);