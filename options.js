import { loadConfig, saveConfig } from "./config.js";
import { isValidUrl } from "./helpers.js";
import { Logger } from "./logger.js";

let config;

function showConfig() {
  document.getElementById("whisperUrl").value = config.WHISPER_URL;
  document.getElementById("whisperApiKey").value = config.WHISPER_API_KEY;
  document.getElementById("aiScribeUrl").value = config.AI_SCRIBE_URL;
  document.getElementById("aiScribeModel").value = config.AI_SCRIBE_MODEL;
  document.getElementById("aiScribeContextBefore").value =
    config.AI_SCRIBE_CONTEXT_BEFORE;
  document.getElementById("aiScribeContextAfter").value =
    config.AI_SCRIBE_CONTEXT_AFTER;
  document.getElementById("realtimeToggle").checked = config.REALTIME;
}

function updateConfig() {
  let whisperUrl = document.getElementById("whisperUrl").value;

  if (!isValidUrl(whisperUrl)) {
    alert("Invalid Whisper URL");
    return;
  }

  let whisperApiKey = document.getElementById("whisperApiKey").value;

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

  let realtime = document.getElementById("realtimeToggle").checked;

  config.WHISPER_URL = whisperUrl;
  config.WHISPER_API_KEY = whisperApiKey;
  config.AI_SCRIBE_URL = aiScribeUrl;
  config.AI_SCRIBE_MODEL = aiScribeModel;
  config.AI_SCRIBE_CONTEXT_BEFORE = aiScribeContextBefore;
  config.AI_SCRIBE_CONTEXT_AFTER = aiScribeContextAfter;
  config.REALTIME = realtime;

  saveConfig(config).then(function () {
    Logger.info("configuration saved!");
  });
}

document.addEventListener("DOMContentLoaded", async function (event) {
  config = await loadConfig();
  showConfig();
});

// Save configuration
document.getElementById("saveConfig").addEventListener("click", updateConfig);
