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
let isReady = false;
let speechToText = '';

async function init() {
    config = await loadConfigData();
    console.log(config);
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
        setStatus("ready");
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
        setStatus("loading");
        if (!isLoadingLlmorS2T) {
            isLoadingLlmorS2T = true;
            sendMessage('recording-status', {
                text: "Loading...", color: "#6c757d", status: "loading"
            });
        }
    },
    progress: (data, type) => {
        if (!isLoadingLlmorS2T) {
            isLoadingLlmorS2T = true;
            sendMessage('recording-status', {
                text: "Loading...", color: "#6c757d", status: "loading"
            });
        }
    },
    done: (data, type) => {},
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

function setStatus(status) {
    if (status === "loading") {
        sendMessage('status', {
            ready: false
        });
    } else if (status === "ready") {
        isReady = true;
        sendMessage('status', {
            ready: true
        });
    }
}

async function startRecording(streamId) {
    if (mediaRecorder?.state === 'recording') {
        throw new Error('Called startRecording while recording is in progress.');
    }

    apiCounter = 0;
    audioChunks = [];

    try {
        tabStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab', chromeMediaSourceId: streamId
                }
            }, video: false
        });
    } catch (error) {
        console.error('Error capturing tab audio:', error);
        sendMessage('recording-status', {
            text: "Error: Unable to start recording.", color: "#dc3545", status: "error"
        });
        return;
    }

    let micStream;

    // Capture microphone audio
    try {
        micStream = await navigator.mediaDevices.getUserMedia({audio: true, video: false});
    } catch (error) {
        console.error('Error capturing microphone audio:', error);
        sendMessage('recording-status', {
            text: "Error: Unable to start recording.", color: "#dc3545", status: "error"
        });
        return;
    }

    // Create an AudioContext to mix streams
    const audioContext = new AudioContext();
    const tabSource = audioContext.createMediaStreamSource(tabStream);
    const micSource = audioContext.createMediaStreamSource(micStream);
    const destination = audioContext.createMediaStreamDestination();

    // Create a gain node for the tab audio (for volume control if needed)
    const tabGain = audioContext.createGain();
    tabGain.gain.value = 1; // Set to 1 for passthrough, or adjust as needed

    // Connect the tab audio to both the destination and the audio context destination (speakers)
    tabSource.connect(tabGain);
    tabGain.connect(destination);
    tabGain.connect(audioContext.destination);

    // Connect both sources to the destination
    tabSource.connect(destination);
    micSource.connect(destination);

    // Combine the audio tracks into a single MediaStream
    const combinedStream = destination.stream;

    // Start recording.
    mediaRecorder = new MediaRecorder(combinedStream, {mimeType: 'audio/webm'});

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
            } else if (!isRecording) {
                // preProcessData();
            }
        }
    };

    if (config.REALTIME) {
        scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
        micSource.connect(scriptProcessor);
        tabSource.connect(scriptProcessor);
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
    isRecording = true;
    sendMessage('recording-status', {
        text: "Recording...", color: "#dc3545", status: "recording"
    });
}

async function stopRecording() {
    if (silenceTimeout) {
        clearTimeout(silenceTimeout);
        silenceTimeout = null;
    }
    mediaRecorder.stop();
    if (tabStream) {
        tabStream.getTracks().forEach((t) => t.stop());
    }
    isRecording = false;
    isPause = false;

    sendMessage('recording-status', {
        text: "Stopped", color: "#28a745", status: "stopped"
    });
}

async function pauseRecording() {
    if (!isRecording) {
        throw new Error('Called pauseRecording while not recording.');
    }

    if (silenceTimeout) {
        clearTimeout(silenceTimeout);
        silenceTimeout = null;
    }

    mediaRecorder.pause();
    isPause = true;

    sendMessage('recording-status', {
        text: "Paused", color: "#ffc107", status: "paused"
    });
}

async function resumeRecording() {
    if (!isPause) {
        throw new Error('Called resumeRecording while not paused.');
    }

    mediaRecorder.resume();
    isPause = false;

    sendMessage('recording-status', {
        text: "Recording...", color: "#dc3545", status: "recording"
    });
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
                sendMessage('recording-status', {
                    text: "Transcribing...", color: "#4c28a7", status: "transcribing"
                });
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
        throw new Error(`Failed to convert audio to text: ${error.message}`, {
            cause: error,
        });
    } finally {
        hideLoader();
    }
}

function showLoader() {
    apiCounter++;
    // document.getElementById("s2t-loader").style.display = "block";
}

function hideLoader() {
    apiCounter--;

    // Hide loader
    // if (apiCounter == 0) {
    //     document.getElementById("s2t-loader").style.display = "none";
    // }
}

async function updateGUI(text) {
    console.log(text);
    speechToText += text;
    speechToText = speechToText.trim();

    let textMessage = "Transcribed!";

    if (speechToText === "") {
        textMessage = "Error: No audio detected.";
    }

    await sendMessage('recording-status', {
        text: textMessage, color: "#4c28a7", status: "transcribing-complete", transcription: speechToText
    });

    // Hide loader
    if (apiCounter === 0 && !isRecording && speechToText !== "") {
        await preProcessData(text);
    }
}

async function llmApiCall(prompt) {
    try {
        const response = await fetch(config.LLM_URL, {
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
        throw error;
    }
}

async function preProcessData(text) {
    logger.log("Pre processing notes");

    if (text.trim() === "") {
        await sendMessage('recording-status', {
            text: "Error: Please record some audio first.", color: "#dc3545", status: "error"
        });
        logger.debug("Please record some audio first.");
        return;
    }

    let sanitizedText = sanitizeInput(text);
    let listOfFacts = null;

    if (config.PRE_PROCESSING) {
        const preProcessingPrompt = `${config.PRE_PROCESSING_PROMPT} ${sanitizedText}`;

        await sendMessage('recording-status', {
            text: "Pre Processing data...", color: "#4c28a7", status: "pre-processing"
        })

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
            await sendMessage('recording-status', {
                text: "Error: Unable to pre-process data.", color: "#dc3545", status: "error"
            });
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

    await sendMessage('recording-status', {
        text: "Generating notes...", color: "#4c28a7", status: "processing"
    })

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
        await sendMessage('recording-status', {
            text: "Error: Unable to generate notes.", color: "#dc3545", status: "error"
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

        await sendMessage('recording-status', {
            text: "Post Processing data...", color: "#4c28a7", status: "post-processing"
        })

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
            await sendMessage('recording-status', {
                text: "Error: Unable to post-process data.", color: "#dc3545", status: "error"
            });
        }
    }

    await showGeneratedNotes(notes);
}

async function showGeneratedNotes(notes) {
    console.log(notes);

    await sendMessage('recording-status', {
        text: "Notes generated!", color: "#28a745", status: "note-generated", notes: notes
    });
}

chrome.runtime.onMessage.addListener(async (message) => {
    if (message.target === 'offscreen') {
        switch (message.type) {
            case 'start-recording':
                startRecording(message.data);
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
            case 'check-status':
                sendMessage('status', {
                    ready: isReady
                });
                break;
            case 'generate-notes':
                preProcessData(message.data);
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

init();