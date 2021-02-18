'use strict';
let initialized = false;
let behavior = null;

function resetViews() {
    document.getElementById('mainTab').style.display = '';
    document.getElementById('settingsTab').style.display = 'none';
    document.getElementById('errorMessage').style.display = 'none';
    document.getElementById('statusMessage').style.display = 'none';
}

function showStatus(message, isError) {
    if (isError) {
        document.getElementById('statusMessage').style.display = 'none';
        document.getElementById('errorMessage').style.display = '';
        document.getElementById('errorMessage').innerText = message;
    } else {
        document.getElementById('errorMessage').style.display = 'none';
        document.getElementById('statusMessage').style.display = '';
        document.getElementById('statusMessage').innerText = message;
    }
}

function setListeners() {
    // The UI logic and listeners need refactoring.
    document.querySelectorAll('#options > button').forEach(el => el.addEventListener('click', e => {
        behavior = e.target.dataset.behavior;
        if (!e.target.classList.contains('active')) {
            vAPI.sendToBackground('updateSettings', {behavior: behavior});
        }
    }));
    document.getElementById('settingsButton').addEventListener('click', e => {
        vAPI.getSettings('whitelist', settings => {
            document.getElementById('whitelist').value = settings.whitelist || '';
            document.getElementById('mainTab').style.display = 'none';
            document.getElementById('settingsTab').style.display = '';
        });
    });
    document.getElementById('whitelistButton').addEventListener('click', () => {
        vAPI.getCurrentTabs().then(tabs =>
            vAPI.sendToBackground('addToWhitelist', {url: tabs[0].url}));

    });
    document.getElementById('save').addEventListener('click', e => {
        // Check and save here. Notify the background.
        // If the handler sends the message to background for update, the content script could update the settings too.
        let value = document.getElementById('whitelist').value;
        vAPI.sendToBackground('updateSettings', {whitelist: value});
    });
    document.getElementById('cancel').addEventListener('click', e => {
        resetViews();
    });
    document.querySelectorAll('button').forEach(el => el.addEventListener('click', e => {
        document.getElementById('errorMessage').style.display = 'none';
        document.getElementById('statusMessage').style.display = 'none';
    }));
}

function init() {
    vAPI.getSettings('behavior', settings => {
        behavior = settings.behavior;
        if (!initialized) {
            setListeners();
            initialized = true;
        }

        // Necessary if open again
        let activeOption = document.querySelector(`#options > button.active`);
        if (activeOption) activeOption.classList.remove('active');

        if (behavior) {
            document.querySelector(`#options > button[data-behavior=${behavior}]`).classList.add('active');
        }
        resetViews();
    });
}

// Temporarily display stickies when clicked on the extension button.
// It should be outside of init, because init is called when the settings changed.
vAPI.getCurrentTabs().then(tabs => {
    vAPI.sendToTabs(tabs, 'settings', {behavior: 'always'});

    window.addEventListener('unload', ev => {
            vAPI.sendToTabs(tabs, 'settings', {behavior: behavior})
        },
        {once: true}
    );
});

// On FF and Chrome the popup window is closed. On Safari the window persists. This function must be idempotent.
vAPI.onPopupOpen(init);

// These listeners could be replaced with promises on updateSettings
vAPI.listen('invalidSettings', (message, sendResponse) => showStatus(message, true));

vAPI.listen('acceptedSettings', init);

vAPI.listen('addToWhitelistError', (message, sendResponse) => showStatus(message.error, true));
vAPI.listen('addToWhitelistSuccess', (message, sendResponse) => showStatus('Added to whitelist'));