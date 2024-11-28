import {loadConfig} from "../src/config.js";
import {Logger} from "../src/logger.js";
import {saveNotesHistory} from "../src/history";

async function init() {
    if (!document.getElementById("recording-screen")) {
        const response = await fetch(chrome.runtime.getURL('/index.html'));

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        document.body.insertAdjacentHTML('beforeend', html);

        let config = await loadConfig();

        let logger = new Logger(config);

        const statusLabel = document.getElementById("status");

        let recordButton = document.getElementById("recordButton");
        let stopButton = document.getElementById("stopButton");
        let pauseButton = document.getElementById("pauseButton");
        let resumeButton = document.getElementById("resumeButton");
        let userInput = document.getElementById("userInput");
        let generateNotesButton = document.getElementById("generateNotesButton");
        let notesElement = document.getElementById("notes");
        let copyNotesButton = document.getElementById("copyNotesButton");
        let showHistory = document.getElementById("showHistory");

        // Request tab audio capture
        const captureTabAudio = async () => {
            return new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    target: 'background', type: 'capture-tab-audio'
                }, (response) => {
                    if (response.success) {
                        resolve(response.streamId);
                    } else {
                        reject(response.error);
                    }
                });
            });
        };

        // Start recording
        recordButton.addEventListener("click", async () => {

            const tabStreamId = await captureTabAudio();

            chrome.runtime.sendMessage({
                target: 'offscreen', type: 'start-recording', data: tabStreamId
            });
        });

        // Stop recording
        stopButton.addEventListener("click", () => {
            chrome.runtime.sendMessage({
                target: 'offscreen', type: 'stop-recording'
            });
        });

        // Pause recording
        pauseButton.addEventListener("click", () => {
            chrome.runtime.sendMessage({
                target: 'offscreen', type: 'pause-recording'
            });
        });

        // Resume recording
        resumeButton.addEventListener("click", () => {
            chrome.runtime.sendMessage({
                target: 'offscreen', type: 'resume-recording'
            });
        });

        // Generate notes
        generateNotesButton.addEventListener("click", () => {
            chrome.runtime.sendMessage({
                target: 'offscreen', type: 'generate-notes', data: userInput.value
            });
        });

        // Copy notes to clipboard
        copyNotesButton.addEventListener("click", () => {
            copyNotesToClipboard(notesElement.textContent);
        });

        // Show history
        showHistory.addEventListener("click", (e) => {
            e.preventDefault();
            chrome.runtime.sendMessage({
                target: 'background', type: 'show-history'
            });
        });

        // Helper function to update status
        const updateStatus = (text, color = "#555") => {
            statusLabel.textContent = `Status: ${text}`;
            statusLabel.style.color = color;
        };

        let copyNotesToClipboard = (text, source = "notes") =>{
            if (text.trim() === "") {
                // toastr.info(`No ${source} to copy.`);
                return;
            }

            navigator.clipboard
                .writeText(text)
                .then(() => {
                    // toastr.info(`${source} copied to clipboard!`);
                })
                .catch((err) => {
                    logger.error("Failed to copy: ", err);
                    // toastr.info(`Failed to copy ${source}. Please try again.`);
                });
        }

        // Listen for messages from the background script
        chrome.runtime.onMessage.addListener((message) => {
            if (message.target === "content") {
                if (message.type === "recording-status") {
                    let {text, color, status} = message.data;
                    updateStatus(text, color);

                    if (status === "recording") {
                        recordButton.style.display = "none";
                        stopButton.style.display = "inline";
                        pauseButton.style.display = "inline";
                        resumeButton.style.display = "none";
                        userInput.style.display = "none";
                        generateNotesButton.style.display = "none";
                        notesElement.textContent = "";
                        notesElement.style.display = "none";
                        copyNotesButton.style.display = "none";
                    } else if (status === "paused") {
                        pauseButton.style.display = "none";
                        resumeButton.style.display = "inline";
                    } else if (status === "transcribing") {
                        recordButton.style.display = "none";
                        stopButton.style.display = "none";
                        pauseButton.style.display = "none";
                    } else if (status === "stopped" || status === "transcribing-complete") {
                        recordButton.style.display = "inline";
                        stopButton.style.display = "none";
                        pauseButton.style.display = "none";
                        resumeButton.style.display = "none";

                        if (message.data?.transcription) {
                            // userInput.style.display = "inline";
                            // generateNotesButton.style.display = "inline";
                            userInput.value = message.data.transcription;
                        }
                    } else if (status === "pre-processing" || status === "processing" || status === "post-processing") {
                        recordButton.disabled = true;
                        generateNotesButton.disabled = true;
                    } else if (status === "note-generated") {
                        recordButton.disabled = false;
                        generateNotesButton.disabled = false;
                        recordButton.style.display = "inline";
                        stopButton.style.display = "none";
                        pauseButton.style.display = "none";
                        resumeButton.style.display = "none";
                        // userInput.style.display = "inline";
                        // generateNotesButton.style.display = "inline";

                        if (message.data?.notes) {
                            notesElement.textContent = message.data.notes;
                            saveNotesHistory(message.data.notes);
                            notesElement.style.display = "block";
                            copyNotesButton.style.display = "inline";
                        }
                    } else if (status === "error") {
                        recordButton.style.display = "inline";
                        recordButton.disabled = false;
                        stopButton.style.display = "none";
                        pauseButton.style.display = "none";
                        resumeButton.style.display = "none";
                        userInput.style.display = "none";
                        generateNotesButton.style.display = "none";
                    }
                } else if (message.type === "status") {
                    if (message.data.ready) {
                        recordButton.disabled = false;
                        userInput.style.display = "none";
                        generateNotesButton.style.display = "none";
                        notesElement.textContent = "";
                        notesElement.style.display = "none";
                        updateStatus("Ready to record", "#28a745");
                    } else {
                        recordButton.disabled = true;
                        updateStatus("Audio capture not ready", "#dc3545");
                    }
                }
            }
        });

        // check status
        chrome.runtime.sendMessage({
            target: 'offscreen', type: 'check-status'
        });
    }
}

init();

