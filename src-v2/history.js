import {getHistory} from "../src/history";

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
                  <buttonn class="accordion-button collapsed" type="button" data-bs-toggle="collapse"
                    data-bs-target="#historyAccordion${index}" aria-expanded="false" aria-controls="historyAccordion${index}"
                  >${dateTime}</button>
                </h2>
                <div id="historyAccordion${index}" class="accordion-collapse collapse" data-bs-parent="#${accordionId}">
                  <div class="accordion-body">
                    <button data-copy-id="history-note-${index}" type="button" class="btn btn-sm btn-secondary copy-history-btn">
                      <i class="fas fa-copy"></i> Copy Notes
                    </button>
                    <pre class="history-notes" id="history-note-${index}">${historyAccordion.note}</pre>
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
        let historyNotesId = event.currentTarget.getAttribute("data-copy-id");

        navigator.clipboard
            .writeText(document.getElementById(historyNotesId).textContent)
            .then(() => {
                toastr.info(`history notes copied to clipboard!`);
            })
            .catch((err) => {
                toastr.info(`Failed to copy history notes. Please try again.`);
            });

    }

    // Add the click event to the copy history buttons
    for (let index = 0; index < copyHistoryButton.length; index++) {
        copyHistoryButton[index].addEventListener("click", copyHistory);
    }
}

init();