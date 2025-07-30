'use strict';

console.log('[DEBUG] Service worker starting...');

// Import libraries at the top (service worker supports importScripts)
try {
    console.log('[DEBUG] Loading libraries...');
    importScripts('lib/underscore.js', 'lib/css-what.js', 'whitelist.js');
    console.log('[DEBUG] Libraries loaded successfully');
    console.log('[DEBUG] _ available:', typeof _ !== 'undefined');
    console.log('[DEBUG] CSSWhat available:', typeof CSSWhat !== 'undefined');
} catch (error) {
    console.error('[ERROR] Failed to load libraries:', error);
}

// Service worker for Manifest V3 - handles extension service worker logic
let settings = {};
console.log('[DEBUG] Settings object initialized');

// Service worker initialization
chrome.runtime.onStartup.addListener(() => {
    console.log('[DEBUG] Service worker onStartup event');
    initializeSettings();
});

chrome.runtime.onInstalled.addListener((details) => {
    console.log('[DEBUG] Service worker onInstalled event:', details);
    initializeSettings();
});

// Also initialize immediately in case events are missed
console.log('[DEBUG] Initializing settings immediately...');
initializeSettings();

function initializeSettings() {
    console.log('[DEBUG] initializeSettings called');
    chrome.storage.local.get(['whitelist', 'behavior', 'isDevelopment'], (result) => {
        console.log('[DEBUG] Storage get result:', result);
        settings = result;

        settings.parsedWhitelist = [];
        if (settings.whitelist) {
            try {
                settings.parsedWhitelist = parseRules(settings.whitelist);
                console.log('[DEBUG] Parsed whitelist rules:', settings.parsedWhitelist.length);
            } catch (e) {
                console.error('[ERROR] Failed to parse whitelist:', e);
            }
        }
        if (!settings.behavior) {
            // Assume that devices without touch have a mouse
            // Note: In service worker, we don't have access to window, so we'll default to 'hover'
            settings.behavior = 'hover';
            console.log('[DEBUG] Setting default behavior to hover');
            chrome.storage.local.set({behavior: settings.behavior});
        }
        console.log('[DEBUG] Settings initialized:', settings);
    });
}

// Helper function to safely send responses (handles closed popup/content script)
function safeSendResponse(sendResponse, response, context = 'unknown') {
    try {
        console.log('[DEBUG] Sending response for', context, ':', response);
        sendResponse(response);
        return true;
    } catch (error) {
        // Catch all connection-related errors
        const errorMsg = error.message || String(error);
        if (errorMsg.includes('Could not establish connection') || 
            errorMsg.includes('Receiving end does not exist') ||
            errorMsg.includes('Extension context invalidated') ||
            errorMsg.includes('The message port closed before a response was received')) {
            console.log('[DEBUG] Receiving end disconnected, ignoring response for', context);
        } else {
            console.error('[ERROR] Failed to send response for', context, ':', error);
        }
        return false;
    }
}

// Message handling
console.log('[DEBUG] Setting up message listener...');
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[DEBUG] Message received:', request.name, 'from:', sender.tab ? 'content script' : 'popup');
    console.log('[DEBUG] Message data:', request.message);
    
    // Check if sender is still valid (for content scripts)
    if (sender.tab && sender.tab.id < 0) {
        console.log('[DEBUG] Invalid sender tab, ignoring message');
        return false;
    }
    
    // Handle message synchronously for V3
    try {
        const response = handleMessageSync(request, sender);
        if (response) {
            console.log('[DEBUG] Sending immediate response via safeSendResponse:', response);
            // Use safeSendResponse for immediate responses in V3
            const sent = safeSendResponse(sendResponse, response, request.name);
            return false; // Don't keep the channel open
        } else {
            // For async operations, handle differently
            handleMessageAsync(request, sender, sendResponse);
            return true; // Keep channel open for async responses
        }
    } catch (error) {
        console.error('[ERROR] Message handling failed:', error);
        safeSendResponse(sendResponse, {name: 'error', message: error.message}, 'error-handler');
        return false;
    }
});
console.log('[DEBUG] Message listener set up successfully');

function handleMessageSync(request, sender) {
    // Handle synchronous messages that can return immediately
    switch(request.name) {
        case 'getSettings':
            return handleGetSettingsSync(request.message);
        case 'updateSettings':
            return handleUpdateSettingsSync(request.message);
        case 'addToWhitelist':
            return handleAddToWhitelistSync(request.message);
        default:
            return null; // Will be handled async
    }
}

function handleMessageAsync(request, sender, sendResponse) {
    // Handle asynchronous messages using safeSendResponse
    switch(request.name) {
        case 'exploreSheet':
            // Explorer functionality should be handled by content script in V3
            console.warn('[WARNING] exploreSheet should be handled by content script, not service worker');
            safeSendResponse(sendResponse, {name: 'sheetExplored', message: {status: 'fail', error: 'exploreSheet not supported in service worker'}}, 'exploreSheet');
            break;
        default:
            console.warn('[WARNING] Unknown async message:', request.name);
            safeSendResponse(sendResponse, {name: 'error', message: 'Unknown message type'}, 'unknown-async');
    }
}

function handleGetSettingsSync(message) {
    console.log('[DEBUG] handleGetSettingsSync called with:', message);
    let response = _.pick(settings, 'behavior', 'isDevelopment');
    if (settings.parsedWhitelist) {
        response.whitelist = matchWhitelist(settings.parsedWhitelist, message.location);
    }
    console.log('[DEBUG] Returning settings response:', response);
    return {name: 'settings', message: response};
}

function handleUpdateSettingsSync(message) {
    console.log('[DEBUG] handleUpdateSettingsSync called with:', message);
    // Apply settings to the settings object
    if (message.whitelist !== undefined) {
        try {
            settings.parsedWhitelist = parseRules(message.whitelist);
            settings.whitelist = message.whitelist;
        } catch (e) {
            console.log('[DEBUG] Returning invalidSettings response:', e.message);
            return {name: 'invalidSettings', message: e.message};
        }
    }
    if (message.behavior) {
        settings.behavior = message.behavior;
    }

    chrome.storage.local.set(message);

    console.log('[DEBUG] Returning acceptedSettings response');
    return {name: 'acceptedSettings'};
}



function handleAddToWhitelistSync(message) {
    console.log('[DEBUG] handleAddToWhitelistSync called with:', message);
    let url = null;
    try {
        url = new URL(message.url);
    } catch (e) {
    }
    if (!url || !url.hostname) {
        return {name: 'addToWhitelistError', message: {error: 'Invalid URL'}};
    }
    let existingRule = settings.parsedWhitelist.find(rule => rule.domain === url.hostname);
    if (existingRule) {
        return {name: 'addToWhitelistError', message: {error: 'The URL already exists in the whitelist'}};
    }

    // This really should be encapsulated in the whitelist module.
    if (!settings.whitelist) {
        settings.whitelist = '||' + url.hostname;
    } else {
        settings.whitelist = settings.whitelist + '\n||' + url.hostname;
    }
    settings.parsedWhitelist = parseRules(settings.whitelist);
    chrome.storage.local.set({whitelist: settings.whitelist});
    return {name: 'addToWhitelistSuccess'};
}
