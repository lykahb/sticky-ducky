'use strict';
let initialized = false;

function resetViews() {
    document.getElementById('mainTab').style.display = '';
    document.getElementById('settingsTab').style.display = 'none';
    document.getElementById('errorMessage').style.display = 'none';
}

function setListeners() {
    // The UI logic and listeners need refactoring.
    document.querySelectorAll('#options > button').forEach(el => el.addEventListener('click', e => {
        let newBehavior = e.target.dataset.behavior;
        if (!e.target.classList.contains('active')) {
            vAPI.sendToBackground('updateSettings', {behavior: newBehavior});
        }
    }));
    document.getElementById('settingsButton').addEventListener('click', e => {
        vAPI.getSettings('whitelist', settings => {
            document.getElementById('whitelist').value = settings.whitelist || '';
            document.getElementById('mainTab').style.display = 'none';
            document.getElementById('settingsTab').style.display = '';
        });
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
}

function init() {
    vAPI.getSettings('behavior', settings => {
        let behavior = settings.behavior;
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

// On FF and Chrome the popup window is closed. On Safari the window persists. This function must be idempotent.
vAPI.onPopupOpen(init);

// These listeners could be replaced with promises on updateSettings
vAPI.listen('invalidSettings', (message, sendResponse) => {
    document.getElementById('errorMessage').style.display = '';
    document.getElementById('errorMessage').innerText = message;
});

vAPI.listen('acceptedSettings', init);
