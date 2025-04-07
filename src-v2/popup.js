import {loadConfig} from "../src/config.js";
import {Logger} from "../src/logger.js";

async function init() {
    let config = await loadConfig();

    let logger = new Logger(config);

    let isRecording = false;

    let recordButton = document.getElementById("recordButton");
    let stopButton = document.getElementById("stopButton");
    let pauseButton = document.getElementById("pauseButton");
    let resumeButton = document.getElementById("resumeButton");
    let userInput = document.getElementById("userInput");
    let generateNotesButton = document.getElementById("generateNotesButton");
    let notesElement = document.getElementById("notes");
    let copyNotesButton = document.getElementById("copyNotesButton");
    let openPage = document.getElementsByClassName("openPage");
    let audioInputSelect = document.getElementById("audioInputSelect");
    let volumeLevel = document.getElementById("volumeLevel");
    let errorMessage = document.getElementById("errorMessage");

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

    document.getElementById("toggleConfig").addEventListener("click", function (event) {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL("options.html"));
        }
    });

    document.getElementById('showHistory').addEventListener('click', function (event) {
        window.open(chrome.runtime.getURL("history.html"));
    })

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

    let showLoader = () => {
        document.getElementById("s2t-loader").style.display = "block";
    }

    let hideLoader = () => {
        document.getElementById("s2t-loader").style.display = "none";
    }

    let startMicStream = () => {
        let constraints = {audio: true};

        // If the selected value starts with "audioinput_", it's our generated ID
        if (!audioInputSelect.value.startsWith("audioinput_")) {
            constraints.audio = {deviceId: {exact: audioInputSelect.value}};
        }

        navigator.mediaDevices
            .getUserMedia(constraints)
            .then((stream) => {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const analyser = audioContext.createAnalyser();
                const microphone = audioContext.createMediaStreamSource(stream);
                const dataArray = new Uint8Array(analyser.frequencyBinCount);

                analyser.fftSize = 512;
                analyser.minDecibels = -127;
                analyser.maxDecibels = 0;
                analyser.smoothingTimeConstant = 0.4;

                microphone.connect(analyser);

                const updateVolume = () => {
                    analyser.getByteFrequencyData(dataArray);

                    let volumeSum = 0;
                    for (const volume of dataArray) {
                        volumeSum += volume;
                    }
                    const averageVolume = volumeSum / dataArray.length;
                    // Value range: 127 = analyser.maxDecibels - analyser.minDecibels;
                    let volume = (averageVolume * 100) / 127;

                    volumeLevel.style.width = `${volume}%`;
                    requestAnimationFrame(updateVolume);
                };

                updateVolume();
            })
            .catch((err) => {
                logger.error("Error accessing the microphone or tab audio:", err);
            });
    }

    let getAudioDevices = () => {
        chrome.runtime.sendMessage({
            target: 'offscreen', type: 'get-audio-devices'
        });
    }

    let setAudioDeviceList = (audioDevices) => {
        audioInputSelect.innerHTML = "";
        audioDevices.forEach((device) => {
            let option = document.createElement("option");
            option.value = device.value;
            option.text = device.text;
            option.selected = device.selected;
            audioInputSelect.appendChild(option);
        });

        startMicStream();

        audioInputSelect.addEventListener("change", (e) => {
            chrome.runtime.sendMessage({
                target: 'offscreen', type: 'set-audio-device', data: e.target.value
            });
        });
    }

    const showTranscription = (transcription) => {
        userInput.style.display = "block";
        generateNotesButton.style.display = "block";
        userInput.value = transcription;
        userInput.scrollTop = userInput.scrollHeight;
    }

    const showNotes = (notes) => {
        notesElement.textContent = notes;
        notesElement.style.display = "block";
        copyNotesButton.style.display = "block";
    }

    let showErrorMessage = (message) => {
        errorMessage.textContent = message;
        errorMessage.style.display = "block";
    }

    let hideErrorMessage = () => {
        errorMessage.textContent = "";
        errorMessage.style.display = "none";
    }

    const recordingStateHandler = {
        "initializing": (data) => {
            recordButton.disabled = true;
        },
        "loading": (data) => {
            recordButton.disabled = true;
        },
        "ready": (data) => {
            recordButton.disabled = false;
        },
        "recording": (data) => {
            isRecording = true;
            userInput.value = "";
            notesElement.textContent = "";
            notesElement.style.display = "none";
            copyNotesButton.style.display = "none";
            audioInputSelect.disabled = true;
            pauseButton.disabled = false;
            isRecording = true;
            recordButton.style.display = "none";
            resumeButton.style.display = "none";
            pauseButton.style.display = "inline";
            stopButton.style.display = "inline";
            generateNotesButton.disabled = true;
        },
        "paused": (data) => {
            pauseButton.style.display = "none";
            resumeButton.style.display = "inline";
        },
        "recording-stopped": (data) => {
            audioInputSelect.disabled = false;
            pauseButton.disabled = true;
            stopButton.style.display = "none";
            recordButton.style.display = "inline";
            resumeButton.style.display = "none";
            pauseButton.style.display = "inline";
        },
        "transcribing": (data) => {
            showLoader();
        },
        "transcription-complete": (data) => {
            showTranscription(data.transcription);
            hideLoader();
            generateNotesButton.disabled = false;
        },
        "realtime-transcribing": (data) => {
            showLoader();
            showTranscription(data.transcription);
            generateNotesButton.disabled = true;
        },
        "pre-processing-prompt": (data) => {
            hideLoader();
            generateNotesButton.disabled = true;
            recordButton.disabled = true;
            showTranscription(data.transcription);
            notesElement.textContent = "Pre Processing data...";
            notesElement.style.display = "block";
        },
        "generating-notes": (data) => {
            generateNotesButton.disabled = true;
            recordButton.disabled = true;
            showTranscription(data.transcription);
            notesElement.textContent = "Generating notes...";
            notesElement.style.display = "block";
        },
        "post-processing-prompt": (data) => {
            generateNotesButton.disabled = true;
            recordButton.disabled = true;
            showTranscription(data.transcription);
            notesElement.textContent = "Post Processing data...";
            notesElement.style.display = "block";
        },
        "complete": (data) => {
            isRecording = false;
            generateNotesButton.disabled = false
            recordButton.disabled = false;
            showTranscription(data.transcription);
            showNotes(data.notes);
        },
        "error": (data) => {
            isRecording = false;
            recordButton.disabled = false;
            audioInputSelect.disabled = false;
            showErrorMessage(data.message)
        }
    }

    const messageHandler = {
        "recorder-state": (message) => {
            const {state, data} = message;
            console.log("Recorder state: ", state, data);
            hideErrorMessage();
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

    // check status
    chrome.runtime.sendMessage({
        target: 'offscreen', type: 'init'
    });

    // get audio devices
    getAudioDevices();
}


init();

