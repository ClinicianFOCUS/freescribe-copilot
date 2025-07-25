// Description: This file contains the functions to save and get notes history in memory.
//
// In-memory storage for notes history
let notesHistory = [];

// Function saveNotesHistory: This function saves the notes history via background script.
export function saveNotesHistory(note, transcription = null) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            { type: 'save-notes', target: 'background', note: note, transcription: transcription },
            (response) => resolve(response)
        );
    });
}

// Function getHistory: This function gets the notes history from background script.
export async function getHistory() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'getHistory', target: 'background' }, (response) => {
            console.log("Received history from background:", response);
            resolve(response.history || []);
        });
    });
}

// Function clearHistory: This function clears the notes history in background script.
export function clearHistory() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'clearHistory', target: 'background' }, (response) => {
            resolve(response);
        });
    });
}
