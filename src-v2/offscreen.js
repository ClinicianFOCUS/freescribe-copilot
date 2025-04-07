import {Logger} from "../src/logger";
import {SilenceDetector} from "../src/silenceDetector";
import {sanitizeInput} from "../src/helpers";
import {saveNotesHistory} from "../src/history";

let config;
let mediaRecorder;
let audioChunks = [];
let tabStream;
let worker;
let logger;
let isLoadingLlmorS2T = false;
let isLlmLoaded = false;
let isS2TLoaded = false;
let isRecording = false;
let isPause = false;
let scriptProcessor;
let silenceTimeout;
let apiCounter = 0;
let speechToText = '';

let audioDeviceId = null;

const RecorderState = {
    INITIALIZING: 'initializing',
    LOADING: 'loading',
    READY: 'ready',
    RECORDING: 'recording',
    PAUSED: 'paused',
    RECORDING_STOPPED: 'recording-stopped',
    TRANSCRIBING: 'transcribing',
    TRANSCRIPTION_COMPLETE: 'transcription-complete',
    REALTIME_TRANSCRIBING: 'realtime-transcribing',
    PRE_PROCESSING_PROMPT: 'pre-processing-prompt',
    GENERATING_NOTES: 'generating-notes',
    POST_PROCESSING_PROMPT: 'post-processing-prompt',
    COMPLETE: 'complete',
    ERROR: 'error',
};

const defaultData = {
    transcription: '',
    notes: '',
    message: '',
}

let state = {
    state: RecorderState.INITIALIZING,
    data: defaultData,
};

async function setState(newState, data = null) {
    let newData = state.data

    if (data?.transcription) {
        newData.transcription = data.transcription;
    }

    if (data?.notes) {
        newData.notes = data.notes;
    }

    if (data?.message) {
        newData.message = data.message;
    }

    if (newState === RecorderState.INITIALIZING ||
        newState === RecorderState.LOADING ||
        newState === RecorderState.READY ||
        newState === RecorderState.RECORDING) {
        newData = defaultData;
    }

    state = {
        state: newState,
        data: newData,
    };
    await sendState();
}

async function sendState() {
    await sendMessage('recorder-state', state);
}

async function init() {
    if (state.state !== RecorderState.INITIALIZING) {
        sendState();
        return;
    }

    await setState(RecorderState.INITIALIZING);
    isPause = false;
    isRecording = false;

    config = await loadConfigData();
    logger = new Logger(config);

    if (config.TRANSCRIPTION_LOCAL || config.LLM_LOCAL) {
        worker = new Worker("./worker.js", {type: "module"});
        worker.addEventListener("message", handleWorkerMessage);

        if (config.TRANSCRIPTION_LOCAL) {
            worker.postMessage({
                type: "load_s2t",
                data: config.TRANSCRIPTION_LOCAL_MODEL,
            });
        } else {
            isS2TLoaded = true;
        }

        if (config.LLM_LOCAL) {
            worker.postMessage({
                type: "load_llm",
                data: config.LLM_LOCAL_MODEL,
            });
        } else {
            isLlmLoaded = true;
        }
    } else {
        isS2TLoaded = true;
        isLlmLoaded = true;
        await setState(RecorderState.READY);
    }
}

async function loadConfigData() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            target: 'background', type: 'load-config',
        }, (response) => {
            if (response.success) {
                resolve(response.config);
            } else {
                reject(response.error);
            }
        });
    });
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
        if (!isLoadingLlmorS2T) {
            isLoadingLlmorS2T = true;
            setState(RecorderState.LOADING);
        }
    },
    progress: (data, type) => {
        if (!isLoadingLlmorS2T) {
            isLoadingLlmorS2T = true;
            setState(RecorderState.LOADING);
        }

        console.log(data);
    },
    done: (data, type) => {
    },
    "ready:llm": (data) => {
        isLlmLoaded = true;
        if (isLlmLoaded && isS2TLoaded) {
            setState(RecorderState.READY);
        }
    },
    "ready:s2t": (data) => {
        isS2TLoaded = true;
        if (isLlmLoaded && isS2TLoaded) {
            setState(RecorderState.READY);
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
            speechToText = '';
        }
        updateGUI(data.data.text);
    },
    "error:llm": (data) => console.error("LLM Error", data),
    "error:s2t": (data) => console.error("S2T Error", data),
};

function handleWorkerMessage(event) {
    const {type, status, ...data} = event.data;
    let handler = workerStatusHandlers[`${status}:${type}`] || workerStatusHandlers[status];
    handler?.(data, type);
}

async function startRecording() {
    if (mediaRecorder?.state === 'recording') {
        await setState(RecorderState.ERROR, {
            message: "Called startRecording while recording is in progress."
        });
        throw new Error('Called startRecording while recording is in progress.');
    }

    if (isRecording) {
        await setState(RecorderState.ERROR, {
            message: "Called startRecording while recording is in progress."
        });
        throw new Error('Called startRecording while recording is in progress.');
    }

    if (state.state === RecorderState.ERROR) {
        await setState(RecorderState.READY, defaultData);
    }

    if (state.state !== RecorderState.READY && state.state !== RecorderState.COMPLETE) {
        await setState(RecorderState.ERROR, {
            message: "Please wait for the previous operation to complete."
        });
        return;
    }

    config = await loadConfigData();

    apiCounter = 0;
    audioChunks = [];
    speechToText = '';

    let micStream;

    let audioConstraints = {audio: true, video: false}

    if (audioDeviceId) {
        audioConstraints = {
            audio: {
                deviceId: audioDeviceId
            },
            video: false
        }
    }

    // Capture microphone audio
    try {
        micStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
    } catch (error) {
        await setState(RecorderState.ERROR, {
            message: "Unable to start recording. microphone access denied."
        });
        return;
    }

    // Start recording.
    mediaRecorder = new MediaRecorder(micStream, {mimeType: 'audio/webm'});

    const silenceDetector = new SilenceDetector(config);

    mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data)
    }
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
            } else if (!isRecording && apiCounter === 0) {
                preProcessData(speechToText);
            }
        }
    };

    if (config.REALTIME) {
        // Create an AudioContext to mix streams
        const audioContext = new AudioContext();
        const micSource = audioContext.createMediaStreamSource(micStream);
        scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
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
                    if (mediaRecorder.state !== "recording" && !isPause) {
                        mediaRecorder.start();
                        recordingStartTime = Date.now(); // Reset the recording start time
                    }
                    logger.log("New recording started after silence");
                }, 50); // 50ms delay before starting new recording
            }
        };
    }

    mediaRecorder.start();
    isRecording = true;
    await setState(RecorderState.RECORDING);
}

async function stopRecording() {
    if (silenceTimeout) {
        clearTimeout(silenceTimeout);
        silenceTimeout = null;
    }
    if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor = null;
    }
    mediaRecorder.stop();
    if (tabStream) {
        tabStream.getTracks().forEach((t) => t.stop());
    }
    isRecording = false;
    isPause = false;

    await setState(RecorderState.RECORDING_STOPPED);
}

async function pauseRecording() {
    if (!isRecording) {
        await setState(RecorderState.ERROR, {
            message: "Called pauseRecording while not recording."
        });
        throw new Error('Called pauseRecording while not recording.');
    }

    if (silenceTimeout) {
        clearTimeout(silenceTimeout);
        silenceTimeout = null;
    }

    mediaRecorder.pause();
    isPause = true;

    await setState(RecorderState.PAUSED);
}

async function resumeRecording() {
    if (!isPause) {
        await setState(RecorderState.ERROR, {
            message: "Called resumeRecording while not paused."
        });
        throw new Error('Called resumeRecording while not paused.');
    }

    mediaRecorder.resume();
    isPause = false;

    if (config.REALTIME) {
        await setState(RecorderState.REALTIME_TRANSCRIBING, {
            transcription: speechToText
        });
    } else {
        await setState(RecorderState.RECORDING);
    }
}

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
                type: "transcribe",
                data: audio,
            });

            if (!config.REALTIME) {
                await setState(RecorderState.TRANSCRIBING);
            }
        };
        fileReader.readAsArrayBuffer(blob);
    } finally {
        audioContext.close();
    }
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
            method: "POST",
            headers: headers,
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        logger.error("Audio to text conversion error:", error);
        await setState(RecorderState.ERROR, {
            message: `Failed to convert audio to text: ${error.message}`
        })
        throw new Error(`Failed to convert audio to text: ${error.message}`, {
            cause: error,
        });
    } finally {
        hideLoader();
    }
}

function showLoader() {
    apiCounter++;
}

function hideLoader() {
    apiCounter--;
}

async function updateGUI(text) {
    speechToText += text;
    speechToText = speechToText.trim();

    if (config.REALTIME && isRecording) {
        await setState(RecorderState.REALTIME_TRANSCRIBING, {
            transcription: speechToText
        });
    } else {
        await setState(RecorderState.TRANSCRIPTION_COMPLETE, {
            transcription: speechToText
        });
    }

    // Hide loader
    if (apiCounter === 0 && !isRecording) {
        await preProcessData(text);
    }
}

async function llmApiCall(prompt) {
    try {
        const response = await fetch(config.LLM_URL + "/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: config.LLM_MODEL,
                messages: [
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                temperature: 0.7,
                max_tokens: 800,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result.choices[0].message.content;
    } catch (error) {
        logger.error("LLM API error:", error);
        await setState(RecorderState.ERROR, {
            message: `Failed to generate notes: ${error.message}`
        });
        throw error;
    }
}

async function preProcessData(text, autoNoteGeneration = true) {
    logger.log("Pre processing notes");

    if (text.trim() === "") {
        await setState(RecorderState.ERROR, {
            message: "Please record some audio first."
        });
        logger.debug("Please record some audio first.");
        return;
    }

    if (autoNoteGeneration && config.MINIMUM_WORD_COUNT_CHECK) {
        const wordCount = text.trim().split(/\s+/).length;
        if (wordCount < config.MINIMUM_WORD_COUNT_LIMIT) {
            await setState(RecorderState.ERROR, {
                message: `Minimum word count limit not met. Word count: ${wordCount}. Please click on the Generate Notes button to proceed.`
            });
            return
        }
    }

    let sanitizedText = sanitizeInput(text);
    let listOfFacts = null;

    if (config.PRE_PROCESSING) {
        const preProcessingPrompt = `${config.PRE_PROCESSING_PROMPT} ${sanitizedText}`;

        await setState(RecorderState.PRE_PROCESSING_PROMPT);

        if (config.LLM_LOCAL) {
            worker.postMessage({
                type: "generate",
                data: {
                    message: preProcessingPrompt,
                    type: "pre-processing",
                    extra: {
                        text: sanitizedText,
                    },
                },
            });
            return;
        }

        try {
            listOfFacts = await llmApiCall(preProcessingPrompt);
        } catch (error) {
            await setState(RecorderState.ERROR, {
                message: "Unable to pre-process data."
            })
            return;
        }
    }

    await generateNotes(sanitizedText, listOfFacts);
}

// Generate notes
async function generateNotes(text, facts) {
    logger.log("generating notes");

    let promptText = text;

    if (facts) {
        promptText = facts;
    }

    const prompt = `${config.LLM_CONTEXT_BEFORE} ${promptText} ${config.LLM_CONTEXT_AFTER}`;

    await setState(RecorderState.GENERATING_NOTES);

    if (config.LLM_LOCAL) {
        worker.postMessage({
            type: "generate",
            data: {
                message: prompt,
                type: "notes-processing",
                extra: {
                    text: text,
                    facts: facts,
                },
            },
        });
        return;
    }

    try {
        let notes = await llmApiCall(prompt);

        await postProcessData(notes, facts);
    } catch (error) {
        await setState(RecorderState.ERROR, {
            message: "Unable to generate notes."
        });
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

        await setState(RecorderState.POST_PROCESSING_PROMPT);

        if (config.LLM_LOCAL) {
            worker.postMessage({
                type: "generate",
                data: {
                    message: postProcessingPrompt,
                    type: "post-processing",
                    extra: {
                        text: text,
                        facts: facts,
                    },
                },
            });
            return;
        }

        try {
            notes = await llmApiCall(postProcessingPrompt);
        } catch (error) {
            await setState(RecorderState.ERROR, {
                message: "Unable to post-process data."
            });
        }
    }

    await showGeneratedNotes(notes);
}

async function showGeneratedNotes(notes) {
    await setState(RecorderState.COMPLETE, {
        notes: notes
    });
    sendMessage('save-notes', notes, 'background');
}

function getAudioDeviceList() {
    // Use the standard Web Audio API to enumerate devices
    navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
            let deviceList = [];

            devices.forEach((device) => {
                if (device.kind === "audioinput" && device.deviceId && device.deviceId !== "") {
                    let option = {};
                    option.value = device.deviceId;
                    option.selected = device.deviceId === audioDeviceId;

                    if (device.label) {
                        option.text = device.label;
                    } else {
                        // If label is not available, use the kind and generated ID
                        option.text = `${device.kind} (${option.value})`;
                    }

                    deviceList.push(option);
                }
            });

            sendMessage('audio-devices', deviceList);
        })
        .catch((err) => {
            logger.error("Error enumerating devices:", err);
        });
}

chrome.runtime.onMessage.addListener(async (message) => {
    if (message.target === 'offscreen') {
        switch (message.type) {
            case 'start-recording':
                startRecording();
                break;
            case 'stop-recording':
                stopRecording();
                break;
            case 'pause-recording':
                pauseRecording();
                break;
            case 'resume-recording':
                resumeRecording();
                break;
            case 'generate-notes':
                preProcessData(message.data, false);
                break;
            case 'get-audio-devices':
                getAudioDeviceList();
                break;
            case 'set-audio-device':
                audioDeviceId = message.data;
                break;
            case 'toggle-recording':
                if (isRecording) {
                    stopRecording();
                } else {
                    startRecording();
                }
            case 'init':
                await init();
                break;
            default:
                throw new Error('Unrecognized message:', message.type);
        }
    }
});

async function sendMessage(type, data, target = 'content') {
    return chrome.runtime.sendMessage({
        target: target, type: type, data: data
    });
}
