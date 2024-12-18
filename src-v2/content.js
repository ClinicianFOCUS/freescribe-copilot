import {loadConfig} from "../src/config.js";
import {Logger} from "../src/logger.js";
import {saveNotesHistory} from "../src/history";

async function init() {
    if (!document.getElementById("free-scribe-extension")) {
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

        document.getElementById('refresh-icon').src = chrome.runtime.getURL("refresh.svg");

        let isRecording = false;
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
        let audioDeviceSelect = document.getElementById("audioDeviceSelect");
        let audioDeviceSelectRefresh = document.getElementById('audioDeviceSelectRefresh');

        // Start recording
        recordButton.addEventListener("click", async () => {
            chrome.runtime.sendMessage({
                target: 'offscreen', type: 'start-recording'
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
            hideAllButtons();
            hideTranscription();
            hideNotes();
            disableAudioDeviceSelect();
        }

        let getAudioDevices = () => {
            chrome.runtime.sendMessage({
                target: 'offscreen', type: 'get-audio-devices'
            });
        }

        let setAudioDeviceList = (audioDevices) => {
            audioDeviceSelect.innerHTML = "";
            audioDevices.forEach((device) => {
                let option = document.createElement("option");
                option.value = device.value;
                option.text = device.text;
                option.selected = device.selected;
                audioDeviceSelect.appendChild(option);
            });

            audioDeviceSelect.addEventListener("change", (e) => {
                chrome.runtime.sendMessage({
                    target: 'offscreen', type: 'set-audio-device', data: e.target.value
                });
            });
        }

        const showRecordButton = () => {
            recordButton.style.display = "block";
            stopButton.style.display = "none";
            pauseButton.style.display = "none";
            resumeButton.style.display = "none";
        }

        const showStopButton = () => {
            recordButton.style.display = "none";
            stopButton.style.display = "block";
            pauseButton.style.display = "block";
            resumeButton.style.display = "none";
        }

        const showResumeButton = () => {
            recordButton.style.display = "none";
            stopButton.style.display = "block";
            pauseButton.style.display = "none";
            resumeButton.style.display = "block";
        }

        const hideAllButtons = () => {
            recordButton.style.display = "none";
            stopButton.style.display = "none";
            pauseButton.style.display = "none";
            resumeButton.style.display = "none";
            generateNotesButton.style.display = "none";
            copyNotesButton.style.display = "none";
        }

        const showTranscription = (transcription) => {
            userInput.style.display = "block";
            generateNotesButton.style.display = "block";
            userInput.value = transcription;
        }

        const hideTranscription = () => {
            userInput.style.display = "none";
            generateNotesButton.style.display = "none";
        }

        const showNotes = (notes) => {
            notesElement.textContent = notes;
            notesElement.style.display = "block";
            copyNotesButton.style.display = "block";
            saveNotesHistory(notes);
        }

        const hideNotes = () => {
            notesElement.textContent = "";
            notesElement.style.display = "none";
            copyNotesButton.style.display = "none";
        }

        const disableAudioDeviceSelect = () => {
            audioDeviceSelect.disabled = true;
            audioDeviceSelectRefresh.disabled = true;
        }

        const enableAudioDeviceSelect = () => {
            audioDeviceSelect.disabled = false;
            audioDeviceSelectRefresh.disabled = false;
        }

        audioDeviceSelectRefresh.addEventListener('click', getAudioDevices);

        const recordingStateHandler = {
            "initializing": (data) => {
                defaultState();
                updateStatus("Initializing", "#007bff");
            }, "loading": (data) => {
                defaultState();
                updateStatus("Loading", "#007bff");
            }, "ready": (data) => {
                showRecordButton();
                enableAudioDeviceSelect();
                updateStatus("Ready to record", "#28a745");
            }, "recording": (data) => {
                isRecording = true;
                showStopButton();
                hideTranscription();
                hideNotes();
                disableAudioDeviceSelect();
                updateStatus("Recording", "#dc3545");
            }, "paused": (data) => {
                showResumeButton()
                updateStatus("Paused", "#ffc107");
            }, "recording-stopped": (data) => {
                showRecordButton();
                hideTranscription();
                hideNotes();
                updateStatus("Recording stopped", "#007bff");
            }, "transcribing": (data) => {
                hideAllButtons();
                updateStatus("Transcribing", "#007bff");
            }, "transcription-complete": (data) => {
                showTranscription(data.transcription);
                generateNotesButton.disabled = false;
                updateStatus("Transcription complete", "#28a745");
            }, "realtime-transcribing": (data) => {
                showTranscription(data.transcription);
                generateNotesButton.disabled = true;
                updateStatus("Realtime transcription", "#007bff");
            }, "pre-processing-prompt": (data) => {
                generateNotesButton.disabled = true;
                showTranscription(data.transcription);
                updateStatus("Pre-processing", "#007bff");
            }, "generating-notes": (data) => {
                generateNotesButton.disabled = true;
                showTranscription(data.transcription);
                updateStatus("Generating notes", "#007bff");
            }, "post-processing-prompt": (data) => {
                generateNotesButton.disabled = true;
                showTranscription(data.transcription);
                updateStatus("Post-processing", "#007bff");
            }, "complete": (data) => {
                isRecording = false;
                showRecordButton();
                showTranscription(data.transcription);
                showNotes(data.notes);
                enableAudioDeviceSelect();
                updateStatus("Processing complete", "#28a745");
            },
            "error": (data) => {
                isRecording = false;
                showRecordButton();
                enableAudioDeviceSelect();
                updateStatus(`Error: ${data.message}` , "#dc3545");
            }
        }

        const messageHandler = {
            "recorder-state": (message) => {
                const {state, data} = message;
                console.log("Recorder state: ", state, data);
                let handler = recordingStateHandler[state];
                handler?.(data);
            },
            "audio-devices": setAudioDeviceList,
            "close-extension": (data) => {
                // destroy the chat window and icon
                document.getElementById("free-scribe-extension").remove();
            }
        }

        // Listen for messages from the background script
        chrome.runtime.onMessage.addListener((message) => {
            if (message.target === "content") {
                const {type, data} = message;
                let handler = messageHandler[type];
                handler?.(data);
            } else if (message?.command === 'start_stop_recording') {
                if (isRecording) {
                    stopButton.click();
                } else {
                    recordButton.click();
                }
            }
        });

        defaultState();

        // check status
        chrome.runtime.sendMessage({
            target: 'offscreen', type: 'init'
        });

        // get audio devices
        getAudioDevices();
    }
}

init();

