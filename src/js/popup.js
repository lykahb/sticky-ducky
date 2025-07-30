'use strict';
console.log('[DEBUG] Popup script starting...');
let initialized = false;
let behavior = null;

// Helper function to send messages to background with retry logic
async function sendMessageToBackground(message, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log('[DEBUG] Sending message to background (attempt', i + 1, '):', message);
            const response = await chrome.runtime.sendMessage(message);
            console.log('[DEBUG] Background response received:', response);
            return response;
        } catch (error) {
            console.warn('[WARNING] Message send failed (attempt', i + 1, '):', error.message);
            
            if (error.message.includes('Could not establish connection') || 
                error.message.includes('Receiving end does not exist')) {
                
                if (i < retries - 1) {
                    // Wait a bit before retrying to let service worker wake up
                    console.log('[DEBUG] Waiting 100ms before retry...');
                    await new Promise(resolve => setTimeout(resolve, 100));
                    continue;
                } else {
                    throw new Error('Service worker not responding. Please try again.');
                }
            } else {
                // For other errors, don't retry
                throw error;
            }
        }
    }
}

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
    document.querySelectorAll('#options > button').forEach(el => el.addEventListener('click', async e => {
        behavior = e.target.dataset.behavior;
        if (!e.target.classList.contains('active')) {
            try {
                const response = await sendMessageToBackground({
                    name: 'updateSettings',
                    message: {behavior: behavior}
                });
                
                if (response && response.name === 'acceptedSettings') {
                    init(); // Refresh UI
                } else {
                    showStatus('Failed to update behavior', true);
                }
            } catch (error) {
                console.error('[ERROR] Failed to update behavior:', error);
                showStatus(error.message, true);
            }
        }
    }));
    document.getElementById('settingsButton').addEventListener('click', e => {
        chrome.storage.local.get(['whitelist'], (settings) => {
            document.getElementById('whitelist').value = settings.whitelist || '';
            document.getElementById('mainTab').style.display = 'none';
            document.getElementById('settingsTab').style.display = '';
        });
    });
    document.getElementById('whitelistButton').addEventListener('click', async () => {
        try {
            const tabs = await chrome.tabs.query({currentWindow: true, active: true});
            const response = await sendMessageToBackground({
                name: 'addToWhitelist',
                message: {url: tabs[0].url}
            });
            
            if (response && response.name === 'addToWhitelistSuccess') {
                showStatus('Added to whitelist');
            } else if (response && response.name === 'addToWhitelistError') {
                showStatus(response.message.error, true);
            } else {
                showStatus('Failed to add to whitelist', true);
            }
        } catch (error) {
            console.error('[ERROR] Failed to add to whitelist:', error);
            showStatus(error.message, true);
        }
    });
    document.getElementById('save').addEventListener('click', async e => {
        // Check and save here. Notify the background.
        // If the handler sends the message to background for update, the content script could update the settings too.
        let value = document.getElementById('whitelist').value;
        try {
            const response = await sendMessageToBackground({
                name: 'updateSettings',
                message: {whitelist: value}
            });
            
            if (response && response.name === 'acceptedSettings') {
                showStatus('Settings saved');
                init(); // Refresh UI
            } else if (response && response.name === 'invalidSettings') {
                showStatus(response.message, true);
            } else {
                showStatus('Failed to save settings', true);
            }
        } catch (error) {
            console.error('[ERROR] Failed to update whitelist:', error);
            showStatus(error.message, true);
        }
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
    console.log('[DEBUG] Popup init called');
    chrome.storage.local.get(['behavior'], (settings) => {
        console.log('[DEBUG] Popup storage get result:', settings);
        behavior = settings.behavior;
        if (!initialized) {
            console.log('[DEBUG] Setting up popup listeners');
            setListeners();
            initialized = true;
        }

        // Necessary if open again
        let activeOption = document.querySelector(`#options > button.active`);
        if (activeOption) activeOption.classList.remove('active');

        if (behavior) {
            console.log('[DEBUG] Setting active behavior button:', behavior);
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

// Message handling (for pushed updates from background)
console.log('[DEBUG] Setting up popup message listeners');
chrome.runtime.onMessage.addListener((request) => {
    console.log('[DEBUG] Popup received pushed message:', request.name);
    // Handle any pushed messages from background if needed
});

// Initialize popup
console.log('[DEBUG] Initializing popup...');
init();