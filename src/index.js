import { loadConfig } from "./config.js";
import { sanitizeInput } from "./helpers.js";
import { Logger } from "./logger.js";

let config;
let mediaRecorder;
let mediaRecorderInterval;
let audioChunks = [];
let audioContext;
let audioInputSelect = document.getElementById("audioInputSelect");
let recordButton = document.getElementById("recordButton");
let stopButton = document.getElementById("stopButton");
let userInput = document.getElementById("userInput");
let notesElement = document.getElementById("notes");
let toggleConfig = document.getElementById("toggleConfig");
let generateNotesButton = document.getElementById("generateNotesButton");
let scriptProcessor;
let silenceStart = null;
let recordingStartTime = null;
let deviceCounter = 0;
let tabStream;

async function init() {
  await loadConfigData();
}

async function loadConfigData() {
  config = await loadConfig();
}

// Toggle configuration visibility
toggleConfig.addEventListener("click", function (event) {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL("options.html"));
  }
});

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
  })
  .catch((err) => {
    Logger.error("Error enumerating devices:", err);
  });

recordButton.addEventListener("click", async () => {
  await loadConfigData();

  let constraints = { audio: true };

  audioChunks = [];
  userInput.value = "";

  // If the selected value starts with "audioinput_", it's our generated ID
  if (!audioInputSelect.value.startsWith("audioinput_")) {
    constraints.audio = { deviceId: { exact: audioInputSelect.value } };
  }

  navigator.mediaDevices
    .getUserMedia(constraints)
    .then((micStream) => {
      chrome.tabCapture.capture(
        { audio: true, video: false },
        (capturedTabStream) => {
          if (chrome.runtime.lastError) {
            Logger.error(chrome.runtime.lastError);
            return;
          }

          tabStream = capturedTabStream;

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

          mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
          };

          mediaRecorder.onstop = () => {
            if (audioChunks.length > 0) {
              let audioBlob = new Blob(audioChunks, { type: "audio/wav" });
              audioChunks = [];
              convertAudioToText(audioBlob).then((result) => {
                updateGUI(result.text);
              });
            }
          };

          if (config.REALTIME) {
            scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
            micSource.connect(scriptProcessor);
            tabSource.connect(scriptProcessor);
            scriptProcessor.connect(audioContext.destination);

            recordingStartTime = Date.now();
            silenceStart = null;
            minRecordingLength = config.REALTIME_RECODING_LENGTH * 1000;

            scriptProcessor.onaudioprocess = function (event) {
              const currentTime = Date.now();
              const recordingDuration = currentTime - recordingStartTime;

              if (recordingDuration < minRecordingLength) {
                // Don't check for silence during the first 5 seconds
                return;
              }

              const inputData = event.inputBuffer.getChannelData(0);
              const inputDataLength = inputData.length;
              let total = 0;

              for (let i = 0; i < inputDataLength; i++) {
                total += Math.abs(inputData[i]);
              }

              const average = total / inputDataLength;

              if (average < config.SILENCE_THRESHOLD) {
                if (silenceStart === null) {
                  silenceStart = currentTime;
                } else {
                  const silenceDuration = currentTime - silenceStart;
                  if (silenceDuration > config.MIN_SILENCE_DURATION) {
                    Logger.log("silence detected");
                    silenceStart = null;

                    // Stop the current mediaRecorder
                    mediaRecorder.stop();

                    // Start a new mediaRecorder after a short delay
                    setTimeout(() => {
                      mediaRecorder.start();
                      recordingStartTime = Date.now(); // Reset the recording start time
                      Logger.log("New recording started after silence");
                    }, 50); // 50ms delay before starting new recording
                  }
                }
              } else {
                Logger.log("voice detected");
                silenceStart = null;
              }
            };
          }

          mediaRecorder.start();

          recordButton.disabled = true;
          stopButton.disabled = false;
          audioInputSelect.disabled = true;
        }
      );
    })
    .catch((err) => {
      Logger.error("Error accessing the microphone or tab audio:", err);
    });
});

stopButton.addEventListener("click", () => {
  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }
  if (mediaRecorderInterval) {
    clearInterval(mediaRecorderInterval);
    mediaRecorderInterval = null;
  }
  mediaRecorder.stop();
  if (tabStream) {
    tabStream.getTracks().forEach((track) => track.stop());
  }
  if (audioContext) {
    audioContext.close();
  }
  recordButton.disabled = false;
  stopButton.disabled = true;
  audioInputSelect.disabled = false;
});

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

generateNotesButton.addEventListener("click", () => {
  const transcribedText = userInput.value;
  if (transcribedText.trim() === "") {
    alert("Please record some audio first.");
    return;
  }

  generateNotes(transcribedText);
});

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

init();
