// Firefox WebExtensions don't let popup script pass a message directly to the content script
// Communicating through storage events is simpler than putting background as a proxy between them.
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get('behavior', response => {
        // Hover works when the client uses a mouse. If the device has touch capabilities, choose scroll
        let defBehavior = DetectIt.deviceType === 'mouseonly' ? 'hover' : 'scroll';
        response.behavior || chrome.storage.local.set({'behavior': defBehavior});
    });
});