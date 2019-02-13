(function(self) {
    'use strict';
    let vAPI = self.vAPI = self.vAPI || {};
    let listeners = {};
    let getListeners = name => listeners[name] || (listeners[name] = []);

    vAPI.sendToBackground = (name, message) => safari.self.tab.dispatchMessage(name, message);
    vAPI.listen = (name, listener) => getListeners(name).push(listener);

    safari.self.addEventListener("message", msg =>
            getListeners(msg.name).map(handler => handler(msg.message)),
        false);
})(this);
