// Description: This file contains the functions to save and get notes history.
//
// Function saveNotesHistory: This function saves the notes history to the storage.
export async function saveNotesHistory(note) {
  // getting notes history
  let notes_history = await getHistory();

  // creating new note object
  let new_note = {
    time: new Date().toString(),
    note: note,
  };

  // saving only last 20 notes
  let new_notes_history = [new_note, ...notes_history].slice(0, 20);

  // saving notes history
  chrome.storage.sync.set({ notes_history: new_notes_history }, function () {
    console.log("notes history saved");
  });
}

// Function getHistory: This function gets the notes history from the storage.
export async function getHistory() {
  return new Promise((resolve) => {
    // getting notes history from storage and resolving it
    chrome.storage.sync.get(["notes_history"], function (result) {
      resolve(result.notes_history || []);
    });
  });
}
