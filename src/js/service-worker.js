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

// Import libraries - different approach for Chrome vs Firefox
if (typeof importScripts !== 'undefined') {
    // Chrome service worker context
    try {
        log('Loading libraries via importScripts...');
        importScripts('lib/underscore.js', 'whitelist.js');
        log('Libraries loaded successfully via importScripts');
    } catch (err) {
        error('Failed to load libraries via importScripts:', err);
    }
} else {
    // Firefox background script context - libraries loaded via manifest
    log('Libraries should be loaded via manifest (Firefox)');
}

// Libraries loaded via manifest for both Chrome and Firefox
log('_ available:', typeof _ !== 'undefined');

log('Service worker starting...');

// Service worker initialization
chrome.runtime.onStartup.addListener(() => {
    log('Service worker onStartup event');
    initializeSettings();
});

chrome.runtime.onInstalled.addListener((details) => {
    log('Service worker onInstalled event:', details);
    initializeSettings();
});

// Also initialize immediately in case events are missed
log('Initializing settings immediately...');
initializeSettings();

function initializeSettings() {
    log('initializeSettings called');
    chrome.storage.local.get(['whitelist', 'behavior', 'isDevelopment'], (result) => {
        log('Storage get result:', result);
        settings = result;

        settings.parsedWhitelist = [];
        if (settings.whitelist) {
            try {
                settings.parsedWhitelist = parseRules(settings.whitelist);
                log('Parsed whitelist rules:', settings.parsedWhitelist.length);
            } catch (e) {
                // This shouldn't happen - when a user adds a rule, it should be valid.
                error('Failed to parse whitelist:', e);
            }
        }
        if (!settings.behavior) {
            // Assume that devices without touch have a mouse
            // Note: In service worker, we don't have access to window, so we'll default to 'hover'
            settings.behavior = 'hover';
            log('Setting default behavior to hover');
            chrome.storage.local.set({behavior: settings.behavior});
        }
        log('Settings initialized:', settings);
    });
}

// Helper function to safely send responses (handles closed popup/content script)
function safeSendResponse(sendResponse, response, context = 'unknown') {
    try {
        log('Sending response for', context, ':', response);
        sendResponse(response);
        return true;
    } catch (err) {
        // Catch all connection-related errors
        const errorMsg = error.message || String(err);
        if (errorMsg.includes('Could not establish connection') || 
            errorMsg.includes('Receiving end does not exist') ||
            errorMsg.includes('Extension context invalidated') ||
            errorMsg.includes('The message port closed before a response was received')) {
            log('Receiving end disconnected, ignoring response for', context);
        } else {
            error('Failed to send response for', context, ':', err);
        }
        return false;
    }
}

// Message handling
log('Setting up message listener...');
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('Message received:', request.name, 'from:', sender.tab ? 'content script' : 'popup');
    log('Message data:', request.message);
    
    // Check if sender is still valid (for content scripts)
    if (sender.tab && sender.tab.id < 0) {
        log('Invalid sender tab, ignoring message');
        return false;
    }
    
    // Handle message synchronously for V3
    try {
        const response = handleMessageSync(request, sender);
        if (response) {
            log('Sending immediate response via safeSendResponse:', response);
            // Use safeSendResponse for immediate responses in V3
            const sent = safeSendResponse(sendResponse, response, request.name);
            return false; // Don't keep the channel open
        } else {
            // For async operations, handle differently
            handleMessageAsync(request, sender, sendResponse);
            return true; // Keep channel open for async responses
        }
    } catch (err) {
        error('Message handling failed:', err);
        safeSendResponse(sendResponse, {name: 'error', message: err.message}, 'error-handler');
        return false;
    }
});
log('Message listener set up successfully');

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
            // TODO: the service worker should fetch the sheet and parse it without using DOM.
            warn('exploreSheet should be handled by content script, not service worker');
            safeSendResponse(sendResponse, {name: 'sheetExplored', message: {status: 'fail', error: 'exploreSheet not supported in service worker'}}, 'exploreSheet');
            break;
        default:
            warn('Unknown async message:', request.name);
            safeSendResponse(sendResponse, {name: 'error', message: 'Unknown message type'}, 'unknown-async');
    }
}

function handleGetSettingsSync(message) {
    log('handleGetSettingsSync called with:', message);
    let response = _.pick(settings, 'behavior', 'isDevelopment');
    if (settings.parsedWhitelist) {
        response.whitelist = matchWhitelist(settings.parsedWhitelist, message.location);
    }
    log('Returning settings response:', response);
    return {name: 'settings', message: response};
}

function handleUpdateSettingsSync(message) {
    log('handleUpdateSettingsSync called with:', message);
    // Apply settings to the settings object
    if (message.whitelist !== undefined) {
        try {
            settings.parsedWhitelist = parseRules(message.whitelist);
            settings.whitelist = message.whitelist;
        } catch (e) {
            log('Returning invalidSettings response:', e.message);
            return {name: 'invalidSettings', message: e.message};
        }
    }
    if (message.behavior) {
        settings.behavior = message.behavior;
    }

    chrome.storage.local.set(message);

    log('Returning acceptedSettings response');
    return {name: 'acceptedSettings'};
}



function handleAddToWhitelistSync(message) {
    log('handleAddToWhitelistSync called with:', message);
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
