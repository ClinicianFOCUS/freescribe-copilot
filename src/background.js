import {loadConfig} from "./config";
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
        loadExtension();
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
        case "start_stop_recording":
            chrome.runtime.sendMessage({
                target: 'offscreen', type: 'toggle-recording'
            });
            break;
    }
});

// Function: getOffscreenDocument - Find offscreen document of the extension and return if exists
async function getOffscreenDocument() {
    // get existing contexts of the extension
    const existingContexts = await chrome.runtime.getContexts({});

    // Check if an offscreen document already exists
    return existingContexts.find((c) => c.contextType === 'OFFSCREEN_DOCUMENT');
}

// Function: loadExtension - Load the extension on the current tab.
// Check if an offscreen document already exists and create a new one if it doesn't.
async function loadExtension() {
    try {
        const offscreenDocument = await getOffscreenDocument();
        if (!offscreenDocument) {
            await chrome.offscreen.createDocument({
                url: 'offscreen.html',
                reasons: ['USER_MEDIA', 'WORKERS'],
                justification: 'Recording from chrome.tabCapture API'
            });
        }
    } catch (error) {
        console.error('Failed to load extension:', error);
        throw error; // Re-throw to allow caller to handle
    }
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
        await loadExtension();
        chrome.runtime.sendMessage({
            target: 'offscreen', type: 'init'
        });
    }
}

// Listener for the extension icon click
chrome.action.onClicked.addListener(async (tab) => {
    try {
        // Initialize extension infrastructure
        await loadExtension();
        
        // Set popup for future clicks (without forcing it open)
        chrome.action.setPopup({popup: 'popup.html'});
        
        // Initialize recording system
        await chrome.runtime.sendMessage({
            target: 'offscreen', 
            type: 'init'
        });
    } catch (error) {
        console.error('Extension initialization error:', error);
    }
});


// Track tab changes to maintain recording state
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    chrome.runtime.sendMessage({
        target: 'offscreen', 
        type: 'get-recording-state'
    }, (response) => {
        if (response) {
            chrome.runtime.sendMessage({
                target: 'content',
                type: 'recorder-state',
                state: response.isRecording ? 
                    (response.isPaused ? 'paused' : 'recording') : 'ready',
                data: {
                    transcription: response.transcription,
                    isPause: response.isPaused
                }
            });
        }
    });
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
    chrome.runtime.sendMessage({
        target: 'offscreen', 
        type: 'get-recording-state'
    }, (response) => {
        if (response) {
            chrome.runtime.sendMessage({
                target: 'content',
                type: 'recorder-state',
                state: response.isRecording ? 
                    (response.isPaused ? 'paused' : 'recording') : 'ready',
                data: {
                    transcription: response.transcription,
                    isPause: response.isPaused
                }
            });
        }
    });
});

// Listener for messages from other parts of the extension
// Load the configuration and send it back to the sender
// Open pages in a new tab
// Forward messages to the offscreen document or content script based on the target

// In-memory storage for notes history
let notesHistory = [];

// Listen for messages from content scripts/popup/pages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => { 
    // Handle legacy action-based messages
    // Handle target-based messages
    if (message.target === "background") {
        console.log("Background.js received message:", message.action || message.type);
        if (message.type === "load-config") {
            // Load the configuration
            loadConfig().then((config) => {
                sendResponse({success: true, config: config});
            });
            return true;
        } else if (message.type === "reload-extension") {
            closeExtension();
            sendResponse({ success: true });
            return true;
        } else if (message.type === 'save-notes') {
            console.log("Saving notes:", message)
            try {
                let new_note = {
                    time: new Date().toString(),
                    note: message.data.note,
                    transcription: message.data.transcription
                };
                
                notesHistory = [new_note, ...notesHistory].slice(0, 20);
                console.log("Notes history saved to background script memory:", notesHistory.length, "items");
                sendResponse({ success: true, count: notesHistory.length });
            } catch (error) {
                console.error("Error saving notes history:", error);
                sendResponse({ success: false, error: error.message });
            }
            return true;
        } else if (message.type === 'getHistory') {
            try {
                console.log("Getting notes history from background script memory:", notesHistory.length, "items");
                sendResponse({ history: notesHistory, success: true });
            } catch (error) {
                console.error("Error getting notes history:", error);
                sendResponse({ history: [], success: false, error: error.message });
            }
                return true;
        } else if (message.type === 'update-template') {
          // Forward to offscreen document
          chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'update-template',
            template: message.template
          });
        } else if (message.type === 'clearHistory') {    
            try {
                notesHistory = [];
                console.log("Notes history cleared from background script memory");
                sendResponse({ success: true });
            } catch (error) {
                console.error("Error clearing notes history:", error);
                sendResponse({ success: false, error: error.message });
            }
            return true;
        }
    }
    // Handle recorder state updates
    else if (message.target === 'content' && message.type === 'recorder-state') {
        let {data} = message;

        let text = '';
        let color = '';

        if (data['state'] === 'error') {
            text = '!';
            color = 'red';
        } else if (data['state'] === 'complete') {
            text = 'DONE';
            color = 'green';
        } else if (data['state'] === 'recording' || data['state'] === 'recording-stopped' || data['state'] === 'transcribing' || data['state'] === 'transcription-complete' || data['state'] === 'realtime-transcribing' || data['state'] === 'pre-processing-prompt' || data['state'] === 'generating-notes' || data['state'] === 'post-processing-prompt') {
            text = 'REC';
            color = 'red';
        } else if (data['state'] === 'paused') {
            text = 'PAUSED';
            color = 'yellow';
        } else if (data['state'] === 'ready') {
            text = 'READY';
            color = 'green';
        } else {
            text = 'LOAD';
            color = 'gray';
        }

        chrome.action.setBadgeText({text});
        chrome.action.setBadgeBackgroundColor({color});
        sendResponse({ success: true });
        return true;
    }
    else {
        console.log("Unhandled message:", message);
        sendResponse({ success: false, error: "Message not handled" });
        return true;
    }
});
