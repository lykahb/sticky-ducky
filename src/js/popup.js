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
            chrome.runtime.sendMessage({
                name: 'updateSettings',
                message: {behavior: behavior}
            });
        }
    }));
    document.getElementById('settingsButton').addEventListener('click', e => {
        chrome.storage.local.get(['whitelist'], (settings) => {
            document.getElementById('whitelist').value = settings.whitelist || '';
            document.getElementById('mainTab').style.display = 'none';
            document.getElementById('settingsTab').style.display = '';
        });
    });
    document.getElementById('whitelistButton').addEventListener('click', () => {
        chrome.tabs.query({currentWindow: true, active: true}, (tabs) => {
            chrome.runtime.sendMessage({
                name: 'addToWhitelist',
                message: {url: tabs[0].url}
            });
        });
    });
    document.getElementById('save').addEventListener('click', e => {
        // Check and save here. Notify the background.
        // If the handler sends the message to background for update, the content script could update the settings too.
        let value = document.getElementById('whitelist').value;
        chrome.runtime.sendMessage({
            name: 'updateSettings',
            message: {whitelist: value}
        });
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
    chrome.storage.local.get(['behavior'], (settings) => {
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
chrome.tabs.query({currentWindow: true, active: true}, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {name: 'settings', message: {behavior: 'always'}});

    window.addEventListener('unload', ev => {
            chrome.tabs.sendMessage(tabs[0].id, {name: 'settings', message: {behavior: behavior}});
        },
        {once: true}
    );
});

// Message handling
chrome.runtime.onMessage.addListener((request) => {
    if (request.name === 'invalidSettings') {
        showStatus(request.message, true);
    } else if (request.name === 'acceptedSettings') {
        init();
    } else if (request.name === 'addToWhitelistError') {
        showStatus(request.message.error, true);
    } else if (request.name === 'addToWhitelistSuccess') {
        showStatus('Added to whitelist');
    }
});

// Initialize popup
init();