import {loadConfig} from "./config.js";
import {sanitizeInput, formatBytes} from "./helpers.js";
import {Logger} from "./logger.js";
import {SilenceDetector} from "./silenceDetector.js";
import {saveNotesHistory, getHistory} from "./history.js";

let config;
let mediaRecorder;
let audioChunks = [];
let audioContext;
let audioInputSelect = document.getElementById("audioInputSelect");
let recordButton = document.getElementById("recordButton");
let stopButton = document.getElementById("stopButton");
let pauseButton = document.getElementById("pauseButton");
let resumeButton = document.getElementById("resumeButton");
let userInput = document.getElementById("userInput");
let notesElement = document.getElementById("notes");
let toggleConfig = document.getElementById("toggleConfig");
let generateNotesButton = document.getElementById("generateNotesButton");
let copyNotesButton = document.getElementById("copyNotesButton");
let volumeLevel = document.getElementById("volumeLevel");
let scriptProcessor;
let deviceCounter = 0;
let micStream;
let silenceTimeout;
let isRecording = false;
let isPause = false;
let apiCounter = 0;
let logger;
let worker;
const loadingStatus = document.getElementById("loadingStatus");
const loadingMessage = document.getElementById("loadingMessage");
const progressContainer = document.getElementById("progressContainer");

let isS2TLoaded = false;
let isLlmLoaded = false;

async function init() {
    await loadConfigData();
    logger = new Logger(config);

    if (config.TRANSCRIPTION_LOCAL || config.LLM_LOCAL) {
        worker = new Worker("./worker.js", {type: "module"});
        worker.addEventListener("message", handleWorkerMessage);

        if (config.TRANSCRIPTION_LOCAL) {
            worker.postMessage({
                type: "load_s2t", data: config.TRANSCRIPTION_LOCAL_MODEL,
            });
        } else {
            isS2TLoaded = true;
        }

        if (config.LLM_LOCAL) {
            worker.postMessage({
                type: "load_llm", data: config.LLM_LOCAL_MODEL,
            });
        } else {
            isLlmLoaded = true;
        }
    } else {
        isS2TLoaded = true;
        isLlmLoaded = true;
    }

    await getAudioDeviceList();

    toastr.options = {
        positionClass: "toast-bottom-center",
        showDuration: "300",
        hideDuration: "1000",
        timeOut: "5000",
        extendedTimeOut: "1000",
    };
}

const llmHandler = {
    "pre-processing": (text, extra) => generateNotes(extra.text, text),
    "notes-processing": (text, extra) => postProcessData(text, extra.facts),
    "post-processing": (text, extra) => showGeneratedNotes(text),
};

const workerStatusHandlers = {
    initiate: (data) => {
    },
    loading: (data) => {
        loadingMessage.textContent = data.message;
        setStatus("loading");
    },
    progress: (data, type) => updateProgress(type + data.file, data.progress, data.total),
    done: (data, type) => removeProgress(type + data.file),
    "ready:llm": (data) => {
        isLlmLoaded = true;
        if (isLlmLoaded && isS2TLoaded) {
            setStatus("ready");
        }
    },
    "ready:s2t": (data) => {
        isS2TLoaded = true;
        if (isLlmLoaded && isS2TLoaded) {
            setStatus("ready");
        }
    },
    "start:llm": (data) => {
    },
    "start:s2t": (data) => showLoader(),
    update: (data) => {
    },
    "complete:llm": (data) => {
        let {text, type, extra} = data.data;

        llmHandler[type]?.(text, extra);
    },
    "complete:s2t": (data) => {
        hideLoader();
        if (config.REALTIME) {
            userInput.value = "";
        }
        updateGUI(data.data.text);
    },
    "error:llm": (data) => logger.error("LLM Error", data),
    "error:s2t": (data) => logger.error("S2T Error", data),
};

function handleWorkerMessage(event) {
    const {type, status, ...data} = event.data;
    let handler = workerStatusHandlers[`${status}:${type}`] || workerStatusHandlers[status];
    handler?.(data, type);
}

function setStatus(status) {
    if (status === "loading") {
        loadingStatus.classList.remove("hidden");
        recordButton.disabled = true;
    } else if (status === "ready") {
        loadingStatus.classList.add("hidden");
        recordButton.disabled = false;
    }
}

function updateProgress(file, progress, total) {
    let progressItem = document.getElementById(file);
    if (!progressItem) {
        progressItem = document.createElement("div");
        progressItem.id = file;
        progressItem.className = "progress";
        let totalSize = isNaN(total) ? "" : ` of ${formatBytes(total)}`;
        progressItem.innerHTML = `<div class="progress-bar"
            role="progressbar"
            style="width: 0%"
            aria-valuenow="0"
            aria-valuemin="0"
            aria-valuemax="100"><small class="justify-content-center d-flex position-absolute w-100">${file} ${totalSize}</small></div>`;
        progressContainer.appendChild(progressItem);
    }
    const progressBar = progressItem.querySelector(".progress-bar");
    progressBar.style.width = `${progress.toFixed(2)}%`;
}

function removeProgress(file) {
    const progressItem = document.getElementById(file);
    if (progressItem) {
        progressContainer.removeChild(progressItem);
    }
}

async function loadConfigData() {
    config = await loadConfig();
}

async function getAudioDeviceList() {
    // Use the standard Web Audio API to enumerate devices
    navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
            devices.forEach((device) => {
                let option = document.createElement("option");
                if (device.deviceId && device.deviceId !== "") {
                    option.value = device.deviceId;
                } else {
                    // Generate a unique ID if deviceId is empty
                    option.value = `${device.kind}_${deviceCounter++}`;
                }

                if (device.label) {
                    option.text = device.label;
                } else {
                    // If label is not available, use the kind and generated ID
                    option.text = `${device.kind} (${option.value})`;
                }

                if (device.kind === "audioinput") {
                    audioInputSelect.appendChild(option);
                }
            });

            startMicStream();
        })
        .catch((err) => {
            logger.error("Error enumerating devices:", err);
        });
}

async function startMicStream() {
    let constraints = {audio: true};

    // If the selected value starts with "audioinput_", it's our generated ID
    if (!audioInputSelect.value.startsWith("audioinput_")) {
        constraints.audio = {deviceId: {exact: audioInputSelect.value}};
    }

    navigator.mediaDevices
        .getUserMedia(constraints)
        .then((stream) => {
            if (micStream) {
                micStream.getTracks().forEach((track) => track.stop());
            }
            micStream = stream;

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

async function startRecording() {
    if (isRecording) {
        logger.info("Recording already in progress");
        return;
    }

    audioChunks = [];
    userInput.value = "";
    notesElement.textContent = "";
    notesElement.style.display = "none";
    copyNotesButton.style.display = "none";
    apiCounter = 0;

    mediaRecorder = new MediaRecorder(micStream);

    const silenceDetector = new SilenceDetector(config);

    mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
        if (audioChunks.length > 0) {
            const isAudioAvailable = await silenceDetector.isAudioAvailable(audioChunks);
            logger.log(isAudioAvailable ? "Recording has sound" : "Recording is silent");

            if (isAudioAvailable) {
                if (config.TRANSCRIPTION_LOCAL) {
                    transcribeAudio();
                } else {
                    let audioBlob = new Blob(audioChunks, {type: "audio/wav"});
                    audioChunks = [];
                    convertAudioToText(audioBlob).then((result) => {
                        updateGUI(result.text);
                    });
                }
            } else if (!isRecording) {
                preProcessData();
            }
        }
    };

    if (config.REALTIME) {
        const audioContext = new AudioContext();
        scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);

        let recordingStartTime = Date.now();
        let minRecordingLength = config.REALTIME_RECODING_LENGTH * 1000;

        scriptProcessor.onaudioprocess = function (event) {
            if (isPause) {
                return false;
            }
            const currentTime = Date.now();
            const recordingDuration = currentTime - recordingStartTime;

            if (recordingDuration < minRecordingLength) {
                return;
            }

            const inputData = event.inputBuffer.getChannelData(0);

            if (silenceDetector.detect(inputData, currentTime)) {
                // Stop the current mediaRecorder
                mediaRecorder.stop();

                // Start a new mediaRecorder after a short delay
                silenceTimeout = setTimeout(() => {
                    if (mediaRecorder.state != "recording" && !isPause) {
                        mediaRecorder.start();
                        recordingStartTime = Date.now(); // Reset the recording start time
                    }
                    logger.log("New recording started after silence");
                }, 50); // 50ms delay before starting new recording
            }
        };
    }

    mediaRecorder.start();
    audioInputSelect.disabled = true;
    pauseButton.disabled = false;
    isRecording = true;
    recordButton.style.display = "none";
    stopButton.style.display = "inline";
}

// Function to transcribe the audio Blob
async function transcribeAudio() {
    let blob = new Blob(audioChunks, {type: "audio/wav"});

    const audioContext = new AudioContext({
        sampleRate: 16_000,
    });

    try {
        const fileReader = new FileReader();

        fileReader.onloadend = async () => {
            const arrayBuffer = fileReader.result;
            const decoded = await audioContext.decodeAudioData(arrayBuffer);
            let audio = decoded.getChannelData(0);

            // Send the audio data to the transcriber
            worker.postMessage({
                type: "transcribe", data: audio,
            });
        };
        fileReader.readAsArrayBuffer(blob);
    } finally {
        audioContext.close();
    }
}

async function stopRecording() {
    if (!isRecording) {
        logger.info("No recording in progress");
        return;
    }

    if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor = null;
    }
    if (silenceTimeout) {
        clearTimeout(silenceTimeout);
        silenceTimeout = null;
    }
    mediaRecorder.stop();
    if (audioContext) {
        audioContext.close();
    }
    audioInputSelect.disabled = false;
    pauseButton.disabled = true;
    isRecording = false;

    stopButton.style.display = "none";
    recordButton.style.display = "inline";
    resumeButton.style.display = "none";
    pauseButton.style.display = "inline";

    if (isPause) {
        preProcessData();
        isPause = false;
    }
}

function pauseRecording() {
    if (!isRecording) {
        logger.error("Recording is not in progress");
        toastr.info("Recording is not in progress");
        return;
    }

    isPause = true;

    if (silenceTimeout) {
        clearTimeout(silenceTimeout);
        silenceTimeout = null;
    }
    mediaRecorder.stop();
    pauseButton.style.display = "none";
    resumeButton.style.display = "inline";
}

function resumeRecording() {
    if (!isRecording) {
        logger.error("Recording is not in progress");
        toastr.info("Recording is not in progress");
        return;
    }

    isPause = false;

    mediaRecorder.start();
    resumeButton.style.display = "none";
    pauseButton.style.display = "inline";
}

async function convertAudioToText(audioBlob) {
    logger.log("Sending audio to server");
    const formData = new FormData();
    formData.append("audio", audioBlob, "audio.wav");

    const headers = {
        Authorization: "Bearer " + config.TRANSCRIPTION_API_KEY,
    };

    // Show loader
    showLoader();

    try {
        const response = await fetch(config.TRANSCRIPTION_URL, {
            method: "POST", headers: headers, body: formData,
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        logger.error("Audio to text conversion error:", error);
        throw new Error(`Failed to convert audio to text: ${error.message}`, {
            cause: error,
        });
    } finally {
        hideLoader();
    }
}

function showLoader() {
    apiCounter++;
    document.getElementById("s2t-loader").style.display = "block";
}

function hideLoader() {
    apiCounter--;

    // Hide loader
    if (apiCounter == 0) {
        document.getElementById("s2t-loader").style.display = "none";
    }
}

function updateGUI(text) {
    userInput.value += text;
    userInput.scrollTop = userInput.scrollHeight;

    // Hide loader
    if (apiCounter == 0 && !isRecording) {
        preProcessData();
    }
}

async function llmApiCall(prompt) {
    try {
        const response = await fetch(config.LLM_URL + "/chat/completions", {
            method: "POST", headers: {
                "Content-Type": "application/json",
            }, body: JSON.stringify({
                model: config.LLM_MODEL, messages: [{
                    role: "user", content: prompt,
                },], temperature: 0.7, max_tokens: 2048,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result.choices[0].message.content;
    } catch (error) {
        throw error;
    }
}

async function preProcessData() {
    logger.log("Pre processing notes");

    const text = userInput.value;
    if (text.trim() === "") {
        logger.debug("Please record some audio first.");
        return;
    }

    let sanitizedText = sanitizeInput(text);
    let listOfFacts = null;

    if (config.PRE_PROCESSING) {
        const preProcessingPrompt = `${config.PRE_PROCESSING_PROMPT} ${sanitizedText}`;

        notesElement.textContent = "Pre Processing data...";
        notesElement.style.display = "block";
        recordButton.disabled = true;

        if (config.LLM_LOCAL) {
            worker.postMessage({
                type: "generate", data: {
                    message: preProcessingPrompt, type: "pre-processing", extra: {
                        text: sanitizedText,
                    },
                },
            });
            return;
        }

        try {
            listOfFacts = await llmApiCall(preProcessingPrompt);
        } catch (error) {
            notesElement.textContent = "Error in Pre Processing data. Please try again.";
            recordButton.disabled = false;
            return;
        }
    }

    generateNotes(sanitizedText, listOfFacts);
}

// Generate notes
async function generateNotes(text, facts) {
    logger.log("generating notes");

    let promptText = text;

    if (facts) {
        promptText = facts;
    }

    const prompt = `${config.LLM_CONTEXT_BEFORE} ${promptText} ${config.LLM_CONTEXT_AFTER}`;

    notesElement.textContent = "Generating notes...";
    notesElement.style.display = "block";
    recordButton.disabled = true;

    if (config.LLM_LOCAL) {
        worker.postMessage({
            type: "generate", data: {
                message: prompt, type: "notes-processing", extra: {
                    text: text, facts: facts,
                },
            },
        });
        return;
    }

    try {
        let notes = await llmApiCall(prompt);

        postProcessData(notes, facts);
    } catch (error) {
        if (error.name === "AbortError") {
            logger.log("Previous generateNotes request was aborted.");
        } else {
            logger.error("Error generating notes:", error);
            notesElement.textContent = "Error generating notes. Please try again.";
        }
        recordButton.disabled = false;
    }
}

async function postProcessData(text, facts) {
    logger.log("post processing notes");
    let notes = text;
    if (config.POST_PROCESSING) {
        let promptText = "";

        if (facts) {
            promptText += `\nFacts:${facts}`;
        }

        promptText += `\nNotes:${text}`;

        const postProcessingPrompt = `${config.POST_PROCESSING_PROMPT} ${promptText}`;

        notesElement.textContent = "Post Processing data...";
        notesElement.style.display = "block";
        recordButton.disabled = true;

        if (config.LLM_LOCAL) {
            worker.postMessage({
                type: "generate", data: {
                    message: postProcessingPrompt, type: "post-processing", extra: {
                        text: text, facts: facts,
                    },
                },
            });
            return;
        }

        try {
            notes = await llmApiCall(postProcessingPrompt);
        } catch (error) {
            notesElement.textContent = "Error in Post Processing data. Please try again.";
            recordButton.disabled = false;
            return;
        }
    }

    showGeneratedNotes(notes);
}

async function showGeneratedNotes(notes) {
    notesElement.textContent = notes;
    notesElement.style.display = "block";
    copyNotesButton.style.display = "block";
    recordButton.disabled = false;
    saveNotesHistory(notes);
}

// function to handle copying notes to clipboard
function copyNotesToClipboard(text, source = "notes") {
    if (text.trim() === "") {
        toastr.info(`No ${source} to copy.`);
        return;
    }

    navigator.clipboard
        .writeText(text)
        .then(() => {
            toastr.info(`${source} copied to clipboard!`);
        })
        .catch((err) => {
            logger.error("Failed to copy: ", err);
            toastr.info(`Failed to copy ${source}. Please try again.`);
        });
}

// Toggle configuration visibility
toggleConfig.addEventListener("click", function (event) {
    if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        window.open(chrome.runtime.getURL("options.html"));
    }
});

recordButton.addEventListener("click", startRecording);

stopButton.addEventListener("click", stopRecording);

pauseButton.addEventListener("click", pauseRecording);

resumeButton.addEventListener("click", resumeRecording);

audioInputSelect.addEventListener("change", startMicStream);

generateNotesButton.addEventListener("click", preProcessData);

copyNotesButton.addEventListener("click", function () {
    copyNotesToClipboard(notesElement.textContent);
});

document
    .getElementById("showHistory")
    .addEventListener("click", async function () {
        let html = ``;

        let notes_history = await getHistory();

        const accordianId = "historyAccordion";

        for (let index = 0; index < notes_history.length; index++) {
            const historyAccordion = notes_history[index];

            let dateTime = new Date(historyAccordion.time).toLocaleString();

            html += `<div class="accordion-item">
                <h2 class="accordion-header">
                  <buttonn class="accordion-button collapsed" type="button" data-bs-toggle="collapse"
                    data-bs-target="#historyAccordian${index}" aria-expanded="false" aria-controls="historyAccordian${index}"
                  >${dateTime}</button>
                </h2>
                <div id="historyAccordian${index}" class="accordion-collapse collapse" data-bs-parent="#${accordianId}">
                  <div class="accordion-body">
                    <button data-copy-id="history-note-${index}" type="button" class="btn btn-sm btn-secondary copy-history-btn">
                      <i class="fas fa-copy"></i> Copy Notes
                    </button>
                    <pre class="history-notes" id="history-note-${index}">${historyAccordion.note}</pre>
                  </div>
                </div>
              </div>`;
        }

        document.getElementById(accordianId).innerHTML = html;

        let copyHistoryButton = document.getElementsByClassName("copy-history-btn");

        let copyHistory = (event) => {
            let historyNotesId = event.currentTarget.getAttribute("data-copy-id");

            copyNotesToClipboard(document.getElementById(historyNotesId).textContent, "history notes");
        }

        for (let index = 0; index < copyHistoryButton.length; index++) {
            copyHistoryButton[index].addEventListener("click", copyHistory);
        }

        $("#historyModel").modal("show");
    });

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start_stop_recording") {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }
});

init();
