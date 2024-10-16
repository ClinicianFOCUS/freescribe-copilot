// Default values for configurable constants
let config = {
  WHISPER_URL: "http://localhost:2224/whisperaudio",
  WHISPER_API_KEY: "your_api_key",
  WHISPER_SOCKET_URL: "ws://localhost:2224/ws",
  AI_SCRIBE_URL: "http://localhost:1337/v1/chat/completions",
  AI_SCRIBE_MODEL: "gemma-2-2b-it",
  AI_SCRIBE_CONTEXT_BEFORE:
    "AI, please transform the following conversation into a concise SOAP note. Do not assume any medical data, vital signs, or lab values. Base the note strictly on the information provided in the conversation. Ensure that the SOAP note is structured appropriately with Subjective, Objective, Assessment, and Plan sections. Strictly extract facts from the conversation. Here's the conversation:",
  AI_SCRIBE_CONTEXT_AFTER:
    "Remember, the Subjective section should reflect the patient's perspective and complaints as mentioned in the conversation. The Objective section should only include observable or measurable data from the conversation. The Assessment should be a summary of your understanding and potential diagnoses, considering the conversation's content. The Plan should outline the proposed management, strictly based on the dialogue provided. Do not add any information that did not occur and do not make assumptions. Strictly extract facts from the conversation.",
};

let mediaRecorder;
let audioChunks = [];
let audioChunks2 = [];
let audioContext;
let socket;
let audioInputSelect = document.getElementById("audioInputSelect");
let recordButton = document.getElementById("recordButton");
let stopButton = document.getElementById("stopButton");
let userInput = document.getElementById("userInput");

let deviceCounter = 0;

let tabStream;

function startWebSocket() {
  if (socket) {
    return;
  }

  socket = new WebSocket(config.WHISPER_SOCKET_URL);

  socket.onopen = function (event) {
    console.log("WebSocket connection established");
  };

  socket.onmessage = function (event) {
    console.log("Transcription received:", event.data);
    // Update your UI with the transcribed text here
  };

  socket.onclose = function (event) {
    console.log("WebSocket connection closed");
    socket = null;
  };

  socket.onerror = function (error) {
    console.error("WebSocket error:", error);
  };
}

function sendWebsocketData(data) {
  if (!socket) {
    console.error("Socket not connected");
  }

  console.log("sending data");

  if (socket.readyState === WebSocket.OPEN) {
    socket.send(data);
  }
}

function toggleConfigView() {
  const configSection = document.getElementById("configSection");
  if (
    configSection.style.display === "none" ||
    configSection.style.display === ""
  ) {
    configSection.style.display = "block";
    this.textContent = "Hide Configuration";
  } else {
    configSection.style.display = "none";
    this.textContent = "Show Configuration";
  }
}

// Toggle configuration visibility
document
  .getElementById("toggleConfig")
  .addEventListener("click", toggleConfigView);

// Load configuration from storage
chrome.storage.sync.get(["config"], function (result) {
  if (result.config) {
    config = { ...config, ...result.config };
  }
  updateConfigInputs();
});

// Update input fields with current config values
function updateConfigInputs() {
  document.getElementById("whisperUrl").value = config.WHISPER_URL;
  document.getElementById("whisperApiKey").value = config.WHISPER_API_KEY;
  document.getElementById("whisperSocketUrl").value = config.WHISPER_SOCKET_URL;
  document.getElementById("aiScribeUrl").value = config.AI_SCRIBE_URL;
  document.getElementById("aiScribeModel").value = config.AI_SCRIBE_MODEL;
  document.getElementById("aiScribeContextBefore").value =
    config.AI_SCRIBE_CONTEXT_BEFORE;
  document.getElementById("aiScribeContextAfter").value =
    config.AI_SCRIBE_CONTEXT_AFTER;
}

const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
};

// Save configuration
document.getElementById("saveConfig").addEventListener("click", function () {
  let whisperUrl = document.getElementById("whisperUrl").value;
  let whisperApiKey = document.getElementById("whisperApiKey").value;
  if (!isValidUrl(whisperUrl)) {
    alert("Invalid Whisper URL");
    return;
  }

  let whisperSocketUrl = document.getElementById("whisperSocketUrl").value;
  if (!isValidUrl(whisperSocketUrl)) {
    alert("Invalid Whisper Socket URL");
    return;
  }

  let aiScribeUrl = document.getElementById("aiScribeUrl").value;

  if (!isValidUrl(aiScribeUrl)) {
    alert("Invalid AI Scribe URL");
    return;
  }

  let aiScribeModel = document.getElementById("aiScribeModel").value;
  let aiScribeContextBefore = document.getElementById(
    "aiScribeContextBefore"
  ).value;
  let aiScribeContextAfter = document.getElementById(
    "aiScribeContextAfter"
  ).value;

  config.WHISPER_URL = whisperUrl;
  config.WHISPER_API_KEY = whisperApiKey;
  config.WHISPER_SOCKET_URL = whisperSocketUrl;
  config.AI_SCRIBE_URL = aiScribeUrl;
  config.AI_SCRIBE_MODEL = aiScribeModel;
  config.AI_SCRIBE_CONTEXT_BEFORE = aiScribeContextBefore;
  config.AI_SCRIBE_CONTEXT_AFTER = aiScribeContextAfter;

  chrome.storage.sync.set({ config: config }, function () {
    console.log("Configuration saved");
    alert("Configuration saved successfully!");
    toggleConfigView();
  });
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

recordButton.addEventListener("click", () => {
  let constraints = { audio: true };

  audioChunks = [];
  userInput.value = "";

  // If the selected value starts with "audioinput_", it's our generated ID
  if (!audioInputSelect.value.startsWith("audioinput_")) {
    constraints.audio = { deviceId: { exact: audioInputSelect.value } };
  }

  let firstChunk = null;

  //startWebSocket();

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

            // if (firstChunk && audioChunks2.length % 5) {
            //   const chunkWithHeader = new Blob([this.firstBlob, event.data], {
            //     type: event.type,
            //   });
            //   audioChunks2.push(chunkWithHeader);
            // } else {
            //   firstChunk = event.data;
            //   audioChunks2.push(firstChunk);
            // }

            // console.log(audioChunks2.length);

            // // audioChunks2.push(event.data);

            // // console.log({ event });

            // if (audioChunks2.length >= 5) {
            //   let newChunks = audioChunks2.splice(0, 5);
            //   console.log("new length" + audioChunks2.length);
            //   sendAudioData(newChunks);
            // }

            // try {
            //   console.log(event.data);
            //   console.log(event.audioBlob);
            // } catch (error) {}
            // sendWebsocketData(event.data);

            let audioBlob = new Blob([event.data], { type: "audio/webm" });

            // send audio to whisper server
            convertAudioToText(audioBlob).then((result) => {
              updateGUI(result.text, true);
            });
          };
          mediaRecorder.onstop = () => {
            return;
            let audioBlob = new Blob(audioChunks, { type: "audio/wav" });
            // let audioUrl = URL.createObjectURL(audioBlob);
            // let audio = new Audio(audioUrl);

            // audio.onended = () => {
            //   URL.revokeObjectURL(audioUrl);
            // };

            // NOTE: If needed, uncomment the following line to play the audio
            // audio.play();

            // send audio to whisper server
            convertAudioToText(audioBlob).then((result) => {
              updateGUI(result.text);
            });
          };
          mediaRecorder.start(5000);
          recordButton.disabled = true;
          stopButton.disabled = false;
          // Disable select elements
          audioInputSelect.disabled = true;
        }
      );
    })
    .catch((err) => {
      console.error("Error accessing the microphone or tab audio:", err);
    });
});

function sendAudioData(data) {
  let audioBlob = new Blob(data, { type: "audio/wav" });

  console.log({ audioBlob });

  // send audio to whisper server
  convertAudioToText(audioBlob).then((result) => {
    updateGUI(result.text, true);
  });
}

stopButton.addEventListener("click", () => {
  mediaRecorder.stop();
  if (tabStream) {
    tabStream.getTracks().forEach((track) => track.stop());
  }
  if (audioContext) {
    audioContext.close();
  }
  recordButton.disabled = false;
  stopButton.disabled = true;
  // Re-enable select elements
  audioInputSelect.disabled = false;
});

async function convertAudioToText(audioBlob) {
  console.log("Sending audio to server");
  const formData = new FormData();

  formData.append("audio", audioBlob, "audio.wav");
  formData.append("file", audioBlob, "audio.wav");

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

function updateGUI(text, realtime = false) {
  if (realtime) {
    text = userInput.value + text;
  }

  userInput.value = text;
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

  // Call a function to generate SOAP notes
  generateSoapNotes(transcribedText);
});

// Sanitize input to prevent XSS attacks
function sanitizeInput(input) {
  return input.replace(/[<>&'"]/g, (char) => {
    const entities = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[char];
  });
}

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
    displaySoapNotes(soapNotes);
  } catch (error) {
    console.error("Error generating SOAP notes:", error);
    alert("Error generating SOAP notes. Please try again.");
  }
}

// Display SOAP notes
function displaySoapNotes(soapNotes) {
  const soapNotesElement = document.getElementById("soapNotes");
  soapNotesElement.textContent = soapNotes;
}
