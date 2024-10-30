import { loadConfig } from "./config.js";
import { sanitizeInput } from "./helpers.js";
import { Logger } from "./logger.js";
import { SilenceDetector } from "./silenceDetector.js";

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
let volumeLevel = document.getElementById("volumeLevel");
let scriptProcessor;
let deviceCounter = 0;
let tabStream;
let micStream;
let silenceTimeout;
let isRecording = false;

async function init() {
  await loadConfigData();
  await getAudioDeviceList();
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
      Logger.error("Error enumerating devices:", err);
    });
}

async function startMicStream() {
  let constraints = { audio: true, video: false };

  // If the selected value starts with "audioinput_", it's our generated ID
  // if (!audioInputSelect.value.startsWith("audioinput_")) {
  //     constraints.audio = {deviceId: {exact: audioInputSelect.value}};
  // }

  // let stream = null;
  //
  // try {
  //     stream = await navigator.mediaDevices.getUserMedia(con);
  //     /* use the stream */
  //     console.log(stream);
  // } catch (err) {
  //     console.log(err);
  //     /* handle the error */
  // }

  let audio = navigator.mediaDevices.getUserMedia(constraints);

  console.log(audio);

  audio
    .then((stream) => {
      if (micStream) {
        micStream.getTracks().forEach((track) => track.stop());
      }
      micStream = stream;

      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
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
      Logger.error("Error accessing the microphone or tab audio:", err);
    });
}

async function startRecording() {
  await loadConfigData();

  audioChunks = [];
  userInput.value = "";

  const audioContext = new AudioContext();
  const micSource = audioContext.createMediaStreamSource(micStream);
  const destination = audioContext.createMediaStreamDestination();

  micSource.connect(destination);

  mediaRecorder = new MediaRecorder(destination.stream);

  const silenceDetector = new SilenceDetector(config);

  mediaRecorder.ondataavailable = (event) => {
    audioChunks.push(event.data);
  };

  mediaRecorder.onstop = async () => {
    if (audioChunks.length > 0) {
      const isAudioAvailable = await silenceDetector.isAudioAvailable(
        audioChunks
      );
      Logger.log(
        isAudioAvailable ? "Recording has sound" : "Recording is silent"
      );

      if (isAudioAvailable) {
        let audioBlob = new Blob(audioChunks, { type: "audio/wav" });
        audioChunks = [];
        convertAudioToText(audioBlob).then((result) => {
          updateGUI(result.text);
        });
      }
    }
  };

  if (config.REALTIME) {
    scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    micSource.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    let recordingStartTime = Date.now();
    let minRecordingLength = config.REALTIME_RECODING_LENGTH * 1000;

    scriptProcessor.onaudioprocess = function (event) {
      const currentTime = Date.now();
      const recordingDuration = currentTime - recordingStartTime;

      if (recordingDuration < minRecordingLength) {
        return;
      }

      const inputData = event.inputBuffer.getChannelData(0);

      if (silenceDetector.detect(inputData, currentTime)) {
        Logger.log("silence detected");
        // Stop the current mediaRecorder
        mediaRecorder.stop();

        // Start a new mediaRecorder after a short delay
        silenceTimeout = setTimeout(() => {
          mediaRecorder.start();
          recordingStartTime = Date.now(); // Reset the recording start time
          Logger.log("New recording started after silence");
        }, 50); // 50ms delay before starting new recording
      } else {
        Logger.log("voice detected");
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

async function startRecordingOld() {
  await loadConfigData();

  audioChunks = [];
  userInput.value = "";

  const displayMediaOptions = {
    video: {
      displaySurface: "browser", // or "window" if you prefer
    },
    audio: true, // Enable audio capture from the tab in Chrome
    systemAudio: "include",
  };

  navigator.mediaDevices
    .getDisplayMedia(displayMediaOptions)
    .then((stream) => {
      // Do something with the stream, e.g., play it in an audio element

      let getAudioTracks = stream.getAudioTracks();

      console.log(getAudioTracks);

      if (getAudioTracks.length == 0) {
        return;
      }

      stream.getVideoTracks()[0].onended = () => {
        console.log("User stopped sharing the screen/tab");
        stopRecording();
      };

      tabStream = stream;

      const audioContext = new AudioContext();
      const micSource = audioContext.createMediaStreamSource(micStream);
      const tabSource = audioContext.createMediaStreamSource(tabStream);
      const destination = audioContext.createMediaStreamDestination();

      // Create a gain node for the tab audio (for volume control if needed)
      const tabGain = audioContext.createGain();
      tabGain.gain.value = 1; // Set to 1 for passthrough, or adjust as needed

      // Connect the tab audio to both the destination and the audio context destination (speakers)
      tabSource.connect(tabGain);
      tabGain.connect(destination);
      tabGain.connect(audioContext.destination);

      micSource.connect(destination);

      const combinedStream = destination.stream;

      mediaRecorder = new MediaRecorder(combinedStream);

      const silenceDetector = new SilenceDetector(config);

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        if (audioChunks.length > 0) {
          const isAudioAvailable = await silenceDetector.isAudioAvailable(
            audioChunks
          );
          Logger.log(
            isAudioAvailable ? "Recording has sound" : "Recording is silent"
          );

          if (isAudioAvailable) {
            let audioBlob = new Blob(audioChunks, { type: "audio/wav" });
            audioChunks = [];
            convertAudioToText(audioBlob).then((result) => {
              updateGUI(result.text);
            });
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
          const currentTime = Date.now();
          const recordingDuration = currentTime - recordingStartTime;

          if (recordingDuration < minRecordingLength) {
            return;
          }

          const inputData = event.inputBuffer.getChannelData(0);

          if (silenceDetector.detect(inputData, currentTime)) {
            Logger.log("silence detected");
            // Stop the current mediaRecorder
            mediaRecorder.stop();

            // Start a new mediaRecorder after a short delay
            silenceTimeout = setTimeout(() => {
              mediaRecorder.start();
              recordingStartTime = Date.now(); // Reset the recording start time
              Logger.log("New recording started after silence");
            }, 50); // 50ms delay before starting new recording
          } else {
            Logger.log("voice detected");
          }
        };
      }

      mediaRecorder.start();
      audioInputSelect.disabled = true;
      pauseButton.disabled = false;
      isRecording = true;
      recordButton.style.display = "none";
      stopButton.style.display = "inline";
    })
    .catch((error) => {
      console.error("Error getting desktop capture stream:", error);
    });
}

async function stopRecording() {
  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }
  if (silenceTimeout) {
    clearTimeout(silenceTimeout);
    silenceTimeout = null;
  }
  mediaRecorder.stop();
  if (tabStream) {
    tabStream.getTracks().forEach((track) => track.stop());
  }
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
}

function pauseRecording() {
  if (!isRecording) {
    Logger.error("Recording is not in progress");
    alert("Recording is not in progress");
    return;
  }

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
    Logger.error("Recording is not in progress");
    alert("Recording is not in progress");
    return;
  }

  mediaRecorder.start();
  resumeButton.style.display = "none";
  pauseButton.style.display = "inline";
}

async function convertAudioToText(audioBlob) {
  Logger.log("Sending audio to server");
  const formData = new FormData();
  formData.append("audio", audioBlob, "audio.wav");

  const headers = {
    Authorization: "Bearer " + config.TRANSCRIPTION_API_KEY,
  };

  try {
    const response = await fetch(config.TRANSCRIPTION_URL, {
      method: "POST",
      headers: headers,
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    Logger.error("Audio to text conversion error:", error);
    throw new Error(`Failed to convert audio to text: ${error.message}`, {
      cause: error,
    });
  }
}

function updateGUI(text) {
  userInput.value += text;
  userInput.scrollTop = userInput.scrollHeight;
}

// Generate notes
async function generateNotes(text) {
  Logger.log("Generating notes");

  const sanitizedText = sanitizeInput(text);

  const prompt = `${config.LLM_CONTEXT_BEFORE} ${sanitizedText} ${config.LLM_CONTEXT_AFTER}`;

  try {
    // Show loading indicator
    notesElement.textContent = "Generating notes...";
    notesElement.style.display = "block";

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
    const notes = result.choices[0].message.content;
    notesElement.textContent = notes;
    notesElement.style.display = "block";
  } catch (error) {
    Logger.error("Error generating notes:", error);
    notesElement.textContent = "Error generating notes. Please try again.";
  }
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

generateNotesButton.addEventListener("click", () => {
  const transcribedText = userInput.value;
  if (transcribedText.trim() === "") {
    alert("Please record some audio first.");
    return;
  }

  generateNotes(transcribedText);
});

init();
