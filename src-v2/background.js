import {loadConfig} from "../src/config";

// Listener for when the extension is installed or updated
chrome.runtime.onInstalled.addListener((details) => {
    // Check if the reason is an install
    if (details.reason.search(/install/g) === -1) {
        return;
    }
    // Open the welcome page in a new tab
    chrome.tabs.create({
        url: chrome.runtime.getURL("welcome.html"),
        active: true,
    });

    // Create a context menu item
    chrome.contextMenus.create({
        id: "freeScribeCopilot",
        title: "Start FreeScribe Copilot",
        contexts: ["page", "selection"],
    });
});

// Handle context menu item click
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "freeScribeCopilot") {
        loadExtension(tab.id);
    }
});

// Listener for keyboard commands
chrome.commands.onCommand.addListener((command) => {
    switch (command) {
        case "configure":
            // Open the options page
            chrome.runtime.openOptionsPage?.() ||
            window.open(chrome.runtime.getURL("options.html"));
            break;
        default:
            // Send the command to the content script
            chrome.runtime.sendMessage({action: command});
            break;
    }
});

// Function to load the extension
async function loadExtension(tabId) {
    const existingContexts = await chrome.runtime.getContexts({});

    const offscreenDocument = existingContexts.find((c) => c.contextType === 'OFFSCREEN_DOCUMENT');

    // If an offscreen document is already open, close it
    if (offscreenDocument) {
       await chrome.offscreen.closeDocument();
    }

    // Create a new offscreen document
    await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['USER_MEDIA', 'WORKERS'],
        justification: 'Recording from chrome.tabCapture API'
    });

    // Inject the CSS into the current tab
    await chrome.scripting.insertCSS({
        target: {tabId: tabId, allFrames: true}, files: ['content.css']
    });

    // Inject the content script into the current tab
    await chrome.scripting.executeScript({
        target: {tabId: tabId, allFrames: true}, files: ['content.js'],
    });
}

// Listener for the extension icon click
chrome.action.onClicked.addListener(async (tab) => {
    // Load the extension
    await loadExtension(tab.id);
});

// Listener for messages from other parts of the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target === "background") {
        if (message.type === "capture-tab-audio") {
            // Capture the audio from the active tab
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                const tab = tabs[0];
                const tabId = tab.id;

                chrome.tabCapture.getMediaStreamId({
                    targetTabId: tabId
                }, (streamId) => {
                    sendResponse({success: true, streamId: streamId});
                });
            });
            return true;
        } else if (message.type === "load-config") {
            // Load the configuration
            loadConfig().then((config) => {
                sendResponse({success: true, config: config});
            });
            return true;
        } else if(message.type === "show-page") {
            // Open the history page in a new tab
            chrome.tabs.create({
                url: chrome.runtime.getURL(message.page),
                active: true,
            });
        }
    } else if (message.target === "content") {
        // Forward the message to the content script
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, message);
            }
        });
    }
});
