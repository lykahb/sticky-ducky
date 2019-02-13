(function(self) {
    'use strict';
    let vAPI = self.vAPI = self.vAPI || {};
    let listeners = {};
    let getListeners = name => listeners[name] || (listeners[name] = []);

    vAPI.sendToBackground = (name, message) => browser.runtime.sendMessage({name: name, message: message});
    vAPI.listen = (name, listener) => getListeners(name).push(listener);

    browser.runtime.onMessage.addListener(request => {
        getListeners(request.name).map(handler => handler(request.message));
    });
    browser.storage.onChanged.addListener(changes => {
        // Don't pass the raw text whitelist
        let settings = _.pick(changes, 'isDevelopment', 'behavior');
        settings = _.mapObject(changes, change => change.newValue);
        if (!_.isEmpty(settings)) {
            getListeners('settingsChanged').map(listener => listener(settings));
        }
    });
})(this);
