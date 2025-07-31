'use strict';

let settings = {};
function internalLog(logger, ...args) {
    if (settings.isDevelopment) {
        logger('Sticky Ducky: ', ...args);
    }
}

const log = (...args) => internalLog(console.log, ...args);
const warn = (...args) => internalLog(console.warn, ...args);
const error = (...args) => console.error('Sticky Ducky: ', ...args);

let initialized = false;

// Helper function to send messages to service worker with retry logic
async function sendMessageToServiceWorker(message, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            log('Sending message to service worker (attempt', i + 1, '):', message);
            const response = await chrome.runtime.sendMessage(message);
            log('Service worker response received:', response);
            return response;
        } catch (err) {
            warn('Message send failed (attempt', i + 1, '):', err.message);
            
            if (err.message.includes('Could not establish connection') || 
                err.message.includes('Receiving end does not exist')) {
                
                if (i < retries - 1) {
                    // Wait a bit before retrying to let service worker wake up
                    log('Waiting 100ms before retry...');
                    await new Promise(resolve => setTimeout(resolve, 100));
                    continue;
                } else {
                    throw new Error('Service worker not responding. Please try again.');
                }
            } else {
                // For other errors, don't retry
                throw err;
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
        const behavior = e.target.dataset.behavior;
        if (!e.target.classList.contains('active')) {
            try {
                const response = await sendMessageToServiceWorker({
                    name: 'updateSettings',
                    message: {behavior: behavior}
                });
                
                if (response && response.name === 'acceptedSettings') {
                    init(); // Refresh UI
                } else {
                    showStatus('Failed to update behavior', true);
                }
            } catch (err) {
                error('Failed to update behavior:', err);
                showStatus(err.message, true);
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
            const response = await sendMessageToServiceWorker({
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
        } catch (err) {
            error('Failed to add to whitelist:', err);
            showStatus(err.message, true);
        }
    });
    document.getElementById('save').addEventListener('click', async e => {
        // Check and save here. Notify the service worker.
        // If the handler sends the message to service worker for update, the content script could update the settings too.
        let value = document.getElementById('whitelist').value;
        try {
            const response = await sendMessageToServiceWorker({
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
        } catch (err) {
            error('Failed to update whitelist:', err);
            showStatus(err.message, true);
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
    log('Popup init called');
    chrome.storage.local.get(['behavior', 'isDevelopment'], (result) => {
        log('Popup storage get result:', result);
        settings = result;
        if (!initialized) {
            log('Setting up popup listeners');
            setListeners();
            initialized = true;
        }

        // Necessary if open again
        let activeOption = document.querySelector(`#options > button.active`);
        if (activeOption) activeOption.classList.remove('active');

        if (settings.behavior) {
            log('Setting active behavior button:', settings.behavior);
            document.querySelector(`#options > button[data-behavior=${settings.behavior}]`).classList.add('active');
        }
        resetViews();
    });
}

// Temporarily display stickies when clicked on the extension button.
// It should be outside of init, because init is called when the settings changed.
chrome.tabs.query({currentWindow: true, active: true}, (tabs) => {
    log('Show all stickies for the current tab:', {behavior: 'always'});
    chrome.tabs.sendMessage(tabs[0].id, {name: 'temporaryShowStickies', message: {behavior: 'always'}});
});

// Message handling (for pushed updates from service worker)
log('Setting up popup message listeners');
chrome.runtime.onMessage.addListener((request) => {
    log('Popup received pushed message:', request.name);
    // Handle any pushed messages from service worker if needed
});

// Initialize popup
log('Initializing popup...');
init();