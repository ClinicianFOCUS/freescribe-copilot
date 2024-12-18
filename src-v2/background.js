import {loadConfig} from "../src/config";

// Save all the hosts that have the extension loaded
let tabsActive = [];

// Listener for when the extension is installed or updated and if installed,
// open the welcome page in a new tab to show the user the new features and ask user permission to the microphone
// Also, create a context menu item to start the extension
chrome.runtime.onInstalled.addListener((details) => {
    // Check if the reason is an installation
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

// Handle the context menu item click event and load the extension on the current tab
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "freeScribeCopilot") {
        const host = getHostFromURL(tab.url);
        loadExtension(tab.id, host);
    }
});

// Listener for keyboard commands and pass the command to the content script or open the options page
chrome.commands.onCommand.addListener((command, tab) => {
    switch (command) {
        case "configure":
            // Open the options page
            chrome.runtime.openOptionsPage?.() ||
            window.open(chrome.runtime.getURL("options.html"));
            break;
        default:
            // Send the command to the content script
            chrome.tabs.sendMessage(tab.id, {command: command});
            break;
    }
});

// Function: getHostFromURL - Extract the host from a URL
function getHostFromURL(url) {
    try {
        const parsedURL = new URL(url);
        return parsedURL.host; // Includes hostname and port, if any
    } catch (e) {
        console.error('Invalid URL:', e.message);
        return null;
    }
}

// Function: getOffscreenDocument - Find offscreen document of the extension and return if exists
async function getOffscreenDocument() {
    // get existing contexts of the extension
    const existingContexts = await chrome.runtime.getContexts({});

    // Check if an offscreen document already exists
    return existingContexts.find((c) => c.contextType === 'OFFSCREEN_DOCUMENT');
}

// Function: loadExtension - Load the extension on the current tab.
// Check if an offscreen document already exists and create a new one if it doesn't.
// Inject the CSS and content script into the current tab.
// Add the tab to the list of active tabs.
async function loadExtension(tabId, host) {
    // Get Offscreen document if present in the extension context
    const offscreenDocument = await getOffscreenDocument();

    // Only create a new offscreen document if one doesn't already exist
    if (!offscreenDocument) {
        // Create a new offscreen document
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['USER_MEDIA', 'WORKERS'],
            justification: 'Recording from chrome.tabCapture API'
        });
    }

    // Inject the CSS into the current tab
    await chrome.scripting.insertCSS({
        target: {tabId: tabId, allFrames: true}, files: ['content.css']
    });

    // Inject the content script into the current tab
    await chrome.scripting.executeScript({
        target: {tabId: tabId, allFrames: true}, files: ['content.js'],
    });

    if (!host) {
        return;
    }

    // Add the tab to the list of active tabs
    tabsActive.push(host);
}

// Function unloadExtension - Unload the extension from the current tab.
// Remove the tab from the list of active tabs.
// Send a message to the content script of the host to close the extension.
// Offscreen document is not removed as it is shared between all tabs.
async function unloadExtension(tabId, host) {
    // Remove the tab from the list of active tabs
    tabsActive = tabsActive.filter((h) => h !== host);

    // Send a message to the content script to close the extension
    chrome.tabs.query({}, (tabs) => {
        // send message to all the tabs that has the content script injected
        for (let tab of tabs) {
            let tabHost = getHostFromURL(tab.url);
            if (host === tabHost) {
                closeExtensionOnTab(tab.id)
            }
        }
    });
}

// Function: closeExtensionOnTab - send message to the tab to close the extension
async function closeExtensionOnTab(tabId) {
    return chrome.tabs.sendMessage(tabId, {
        target: 'content', type: 'close-extension',
    });
}

// Function: closeExtension - Close all the instance of extension on all the tabs including the offscreen page
// Get the offscreen document and if present close the document
// Get list of all the tabs and send message to close the extension on all the active domain
// clear the list of active tabs
async function closeExtension() {
    // Get Offscreen document if present in the extension context
    const offscreenDocument = getOffscreenDocument();

    // if offscreen document is open close the doucment
    if (offscreenDocument) {
        await chrome.offscreen.closeDocument();
    }

    // check if extension is active on any tabs if active get list of all tabs
    // and send message to close extension on the tabs its loaded into.
    if (tabsActive.length) {
        chrome.tabs.query({}, (tabs) => {
            // send message to all the tabs that has the content script injected
            for (let tab of tabs) {
                let host = getHostFromURL(tab.url);
                if (tabsActive.includes(host)) {
                    closeExtensionOnTab(tab.id)
                }
            }

            tabsActive = [];
        });
    }
}

// Listener for the extension icon click
// If the extension is already loaded for the host, unload it. Otherwise, load it.
chrome.action.onClicked.addListener(async (tab) => {
    // Get the host from the URL
    const host = getHostFromURL(tab.url);

    // Check if the extension is already loaded for the host and load/unload it
    if (tabsActive.includes(host)) {
        await unloadExtension(tab.id, host);
    } else {
        await loadExtension(tab.id, host);
    }
});

// Listen for tab updates and load the extension if the tab is reloaded or new tab is opened on the active host
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url) {
        let host = getHostFromURL(tab.url);

        // Check if the extension should be loaded for the host
        if (host && tabsActive.includes(host)) {
            loadExtension(tabId);
        }
    }
});


// Listener for messages from other parts of the extension
// Load the configuration and send it back to the sender
// Open pages in a new tab
// Forward messages to the offscreen document or content script based on the target
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target === "background") {
        if (message.type === "load-config") {
            // Load the configuration
            loadConfig().then((config) => {
                sendResponse({success: true, config: config});
            });
            return true;
        } else if (message.type === "show-page") {
            // Open the history page in a new tab
            chrome.tabs.create({
                url: chrome.runtime.getURL(message.page),
                active: true,
            });
        } else if (message.type === "reload-extension") {
            closeExtension();
        }
    } else if (message.target === "content") {
        // Forward the message to the content script
        chrome.tabs.query({}, (tabs) => {
            // send message to all the tabs that has the content script injected
            for (let tab of tabs) {
                let host = getHostFromURL(tab.url);
                if (tabsActive.includes(host)) {
                    chrome.tabs.sendMessage(tab.id, message);
                }
            }
        });
    }
});
