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

// Initialize the history page
// This function initializes the history page by fetching the notes history and rendering it in the accordion.
async function init(){
    // Set the toastr options
    toastr.options = {
        positionClass: "toast-bottom-center",
        showDuration: "300",
        hideDuration: "1000",
        timeOut: "5000",
        extendedTimeOut: "1000",
    };

    // Get the notes history
    let notes_history = await getHistory();

    // ID for the history accordion elementS
    const accordionId = "historyAccordion";

    let html = ``;

    for (let index = 0; index < notes_history.length; index++) {
        const historyAccordion = notes_history[index];

        // Format the date and time to a readable format
        let dateTime = new Date(historyAccordion.time).toLocaleString();

        html += `<div class="accordion-item">
        <h2 class="accordion-header">
          <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse"
            data-bs-target="#historyAccordion${index}" aria-expanded="false" aria-controls="historyAccordion${index}"
          >${dateTime}</button>
        </h2>
        <div id="historyAccordion${index}" class="accordion-collapse collapse" data-bs-parent="#${accordionId}">
          <div class="accordion-body">
            ${historyAccordion.transcription ? `
            <div class="mb-3">
              <div class="row align-items-center mb-2">
                <div class="col-6">
                  <h6 class="mb-0 d-flex align-items-center"><i class="fas fa-microphone me-2"></i>Transcription</h6>
                </div>
                <div class="col-6 text-end">
                  <button data-copy-id="history-transcription-${index}" type="button" class="btn btn-sm btn-secondary copy-history-btn d-flex align-items-center ms-auto">
                    <i class="fas fa-copy me-2"></i>Copy Transcription
                  </button>
                </div>
              </div>
              <div class="transcription-container">
                <pre class="history-transcription" id="history-transcription-${index}">${historyAccordion.transcription}</pre>
              </div>
            </div>
            <hr>
            ` : ''}
            <div class="row align-items-center mb-2">
              <div class="col-6">
                <h6 class="mb-0 d-flex align-items-center"><i class="fas fa-file-alt me-2"></i>Generated Notes</h6>
              </div>
              <div class="col-6 text-end">
                <button data-copy-id="history-note-${index}" type="button" class="btn btn-sm btn-secondary copy-history-btn d-flex align-items-center ms-auto">
                  <i class="fas fa-copy me-2"></i>Copy Notes
                </button>
              </div>
            </div>
            <div class="notes-container">
              <pre class="history-notes" id="history-note-${index}">${historyAccordion.note}</pre>
            </div>
          </div>
        </div>
      </div>`;
    }

    // Render the history accordion
    document.getElementById(accordionId).innerHTML = html;

    // Get the copy history buttons to add the click event
    let copyHistoryButton = document.getElementsByClassName("copy-history-btn");

    // Function to copy the history notes to the clipboard
    function copyHistory(event) {
        let historyContentId = event.currentTarget.getAttribute("data-copy-id");

        navigator.clipboard
            .writeText(document.getElementById(historyContentId).textContent)
            .then(() => {
                const contentType = historyContentId.includes('transcription') ? 'transcription' : 'notes';
                toastr.info(`History ${contentType} copied to clipboard!`);
            })
            .catch((err) => {
                const contentType = historyContentId.includes('transcription') ? 'transcription' : 'notes';
                toastr.info(`Failed to copy history ${contentType}. Please try again.`);
            });
    }

    // Add the click event to the copy history buttons
    for (let index = 0; index < copyHistoryButton.length; index++) {
        copyHistoryButton[index].addEventListener("click", copyHistory);
    }
}

init();