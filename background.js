// Firefox WebExtensions don't let popup script pass a message directly to the content script
chrome.runtime.onMessage.addListener(request => {
    let sendMessage = tab => chrome.tabs.sendMessage(tab.id, {'behavior': request.behavior});
    chrome.tabs.query({}, tabs => tabs.forEach(sendMessage));
    chrome.storage.local.set({'behavior': request.behavior});
});