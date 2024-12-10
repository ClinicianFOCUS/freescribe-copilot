import {loadConfig} from "../src/config.js";
import {Logger} from "../src/logger.js";
import {saveNotesHistory} from "../src/history";

async function init() {
    if (!document.getElementById("recording-screen")) {
        const response = await fetch(chrome.runtime.getURL('/content.html'));

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        document.body.insertAdjacentHTML('beforeend', html);

        let config = await loadConfig();

        let logger = new Logger(config);

        // Chat Icon Logic
        const freeScribeBox = document.getElementById("free-scribe-box");
        const freeScribeIcon = document.getElementById("free-scribe-icon");
        const freeScribeUi = document.getElementById("free-scribe-ui");

        freeScribeIcon.src = chrome.runtime.getURL("freescribe-round.png");

        let isDragging = false;
        let dragOffsetX, dragOffsetY, startPosX, startPosY;
        let hasMoved = false;

// Prevent text selection during drag
        const preventSelection = (e) => e.preventDefault();

// Make the chat icon draggable
        freeScribeBox.addEventListener("mousedown", (e) => {
            isDragging = true;
            dragOffsetX = e.clientX - freeScribeBox.getBoundingClientRect().left;
            dragOffsetY = e.clientY - freeScribeBox.getBoundingClientRect().top;
            startPosX = e.clientX;
            startPosY = e.clientY;
            hasMoved = false;
            freeScribeBox.style.cursor = "grabbing";

            // Prevent text selection
            document.addEventListener("selectstart", preventSelection);
        });

        document.addEventListener("mousemove", (e) => {
            if (isDragging) {
                const moveX = Math.abs(e.clientX - startPosX);
                const moveY = Math.abs(e.clientY - startPosY);
                if (moveX > 5 || moveY > 5) {
                    hasMoved = true;
                }
                freeScribeBox.style.left = e.clientX - dragOffsetX + "px";
                freeScribeBox.style.top = e.clientY - dragOffsetY + "px";
                freeScribeBox.style.right = "auto";
                freeScribeBox.style.bottom = "auto";

                // Reposition chat window
                const chatBoxRect = freeScribeBox.getBoundingClientRect();
                if (!freeScribeUi.classList.contains("hidden")) {
                    freeScribeUi.style.bottom = window.innerHeight - chatBoxRect.top + 10 + "px";
                    freeScribeUi.style.right = window.innerWidth - chatBoxRect.right + 10 + "px";
                }
            }
        });

        document.addEventListener("mouseup", () => {
            if (isDragging) {
                isDragging = false;
                freeScribeBox.style.cursor = "pointer";

                // Remove text selection prevention
                document.removeEventListener("selectstart", preventSelection);

                if (!hasMoved) {
                    // Open/Close chat window
                    toggleChatUI();
                }
            }
        });

// Toggle Chat UI
        let toggleChatUI = function () {
            if (freeScribeUi.classList.contains("hidden")) {
                const chatBoxRect = freeScribeBox.getBoundingClientRect();
                freeScribeUi.style.bottom = window.innerHeight - chatBoxRect.top + 10 + "px";
                freeScribeUi.style.right = window.innerWidth - chatBoxRect.right + 10 + "px";
                freeScribeUi.classList.remove("hidden");
            } else {
                freeScribeUi.classList.add("hidden");
            }
        }

        const statusLabel = document.getElementById("status");

        let recordButton = document.getElementById("recordButton");
        let stopButton = document.getElementById("stopButton");
        let pauseButton = document.getElementById("pauseButton");
        let resumeButton = document.getElementById("resumeButton");
        let userInput = document.getElementById("userInput");
        let generateNotesButton = document.getElementById("generateNotesButton");
        let notesElement = document.getElementById("notes");
        let copyNotesButton = document.getElementById("copyNotesButton");
        let openPage = document.getElementsByClassName("openPage");

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

        // Open Page
        const openPageEvent = (e) => {
            e.preventDefault();
            chrome.runtime.sendMessage({
                target: 'background', type: 'show-page', page: e.target.dataset.page
            });
        }

        for (let index = 0; index < openPage.length; index++) {
            openPage[index].addEventListener("click", openPageEvent);
        }

        // Helper function to update status
        const updateStatus = (text, color = "#555") => {
            statusLabel.textContent = `Status: ${text}`;
            statusLabel.style.color = color;
        };

        let copyNotesToClipboard = (text, source = "notes") => {
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

        let defaultState = () => {
            recordButton.disabled = false;
            stopButton.style.display = "none";
            pauseButton.style.display = "none";
            resumeButton.style.display = "none";
            userInput.style.display = "none";
            generateNotesButton.style.display = "none";
            copyNotesButton.style.display = "none";
            notesElement.textContent = "";
            notesElement.style.display = "none";
        }

        // Listen for messages from the background script
        chrome.runtime.onMessage.addListener((message) => {
            if (message.target === "content") {
                if (message.type === "recording-status") {
                    let {text, color, status} = message.data;
                    updateStatus(text, color);

                    if (status === "recording") {
                        recordButton.style.display = "none";
                        stopButton.style.display = "block";
                        pauseButton.style.display = "block";
                        resumeButton.style.display = "none";
                        userInput.style.display = "none";
                        generateNotesButton.style.display = "none";
                        notesElement.textContent = "";
                        notesElement.style.display = "none";
                        copyNotesButton.style.display = "none";
                    } else if (status === "paused") {
                        pauseButton.style.display = "none";
                        resumeButton.style.display = "block";
                    } else if (status === "transcribing") {
                        recordButton.style.display = "none";
                        stopButton.style.display = "none";
                        pauseButton.style.display = "none";
                    } else if (status === "stopped" || status === "transcribing-complete") {
                        recordButton.style.display = "block";
                        stopButton.style.display = "none";
                        pauseButton.style.display = "none";
                        resumeButton.style.display = "none";

                        if (message.data?.transcription) {
                            userInput.style.display = "block";
                            generateNotesButton.style.display = "block";
                            userInput.value = message.data.transcription;
                        }
                    } else if (status === "pre-processing" || status === "processing" || status === "post-processing") {
                        recordButton.disabled = true;
                        generateNotesButton.disabled = true;
                    } else if (status === "note-generated") {
                        recordButton.disabled = false;
                        generateNotesButton.disabled = false;
                        recordButton.style.display = "block";
                        stopButton.style.display = "none";
                        pauseButton.style.display = "none";
                        resumeButton.style.display = "none";
                        userInput.style.display = "block";
                        generateNotesButton.style.display = "block";

                        if (message.data?.notes) {
                            notesElement.textContent = message.data.notes;
                            saveNotesHistory(message.data.notes);
                            notesElement.style.display = "block";
                            copyNotesButton.style.display = "block";
                        }
                    } else if (status === "error") {
                        defaultState();
                    }
                } else if (message.type === "status") {
                    if (message.data.ready) {
                        defaultState();
                        updateStatus("Ready to record", "#28a745");
                    } else {
                        recordButton.disabled = true;
                        updateStatus("Audio capture not ready", "#dc3545");
                    }
                }
            }
        });

        defaultState();

        // check status
        chrome.runtime.sendMessage({
            target: 'offscreen', type: 'check-status'
        });
    }
}

init();

