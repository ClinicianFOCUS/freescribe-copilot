import { loadConfig } from "./config.js";
import { sanitizeInput } from "./helpers.js";

let config;
let mediaRecorder;
let mediaRecorderInterval;
let audioChunks = [];
let audioContext;
let audioInputSelect = document.getElementById("audioInputSelect");
let recordButton = document.getElementById("recordButton");
let stopButton = document.getElementById("stopButton");
let userInput = document.getElementById("userInput");
let soapNotesElement = document.getElementById("soapNotes");
let toggleConfig = document.getElementById("toggleConfig");

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
    console.error("Error enumerating devices:", err);
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
            console.error(chrome.runtime.lastError);
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
            let audioBlob = new Blob(audioChunks, { type: "audio/wav" });

            convertAudioToText(audioBlob).then((result) => {
              updateGUI(result.text);
            });
          };

          mediaRecorder.start();

          if (config.REALTIME) {
            mediaRecorderInterval = setInterval(() => {
              mediaRecorder.stop();
              mediaRecorder.start();
            }, config.REALTIME_RECODING_LENGTH * 1000);
          }

          recordButton.disabled = true;
          stopButton.disabled = false;
          audioInputSelect.disabled = true;
        }
      );
    })
    .catch((err) => {
      console.error("Error accessing the microphone or tab audio:", err);
    });
});

stopButton.addEventListener("click", () => {
  if (mediaRecorderInterval) {
    clearInterval(mediaRecorderInterval);
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
  console.log("Sending audio to server");
  const formData = new FormData();
  formData.append("audio", audioBlob, "audio.wav");

  const headers = {
    Authorization: "Bearer " + config.WHISPER_API_KEY,
  };

  try {
    const response = await fetch(config.WHISPER_URL, {
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
    console.error("Audio to text conversion error:", error);
    throw new Error(`Failed to convert audio to text: ${error.message}`, {
      cause: error,
    });
  }
}

function updateGUI(text) {
  userInput.value += text;
  userInput.scrollTop = userInput.scrollHeight;
}

// Add this near the top of your file with other element selections
let generateSoapButton = document.getElementById("generateSoapButton");

// Add this event listener at the end of your file
generateSoapButton.addEventListener("click", () => {
  const transcribedText = userInput.value;
  if (transcribedText.trim() === "") {
    alert("Please record some audio first.");
    return;
  }

  generateSoapNotes(transcribedText);
});

// Generate SOAP notes
async function generateSoapNotes(text) {
  console.log("Generating SOAP notes");

  const sanitizedText = sanitizeInput(text);

  const prompt = `${config.AI_SCRIBE_CONTEXT_BEFORE} ${sanitizedText} ${config.AI_SCRIBE_CONTEXT_AFTER}`;

  try {
    const response = await fetch(config.AI_SCRIBE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.AI_SCRIBE_MODEL,
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
    const soapNotes = result.choices[0].message.content;
    soapNotesElement.textContent = soapNotes;
  } catch (error) {
    console.error("Error generating SOAP notes:", error);
    alert("Error generating SOAP notes. Please try again.");
  }
}

init();
