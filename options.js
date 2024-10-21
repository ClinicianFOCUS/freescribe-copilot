import { loadConfig, saveConfig } from "./config.js";
import { isValidUrl } from "./helpers.js";
import { Logger } from "./logger.js";

let config;

function showConfig() {
  document.getElementById("transcriptionUrl").value = config.TRANSCRIPTION_URL;
  document.getElementById("transcriptionApiKey").value =
    config.TRANSCRIPTION_API_KEY;
  document.getElementById("llmUrl").value = config.LLM_URL;
  document.getElementById("llmModel").value = config.LLM_MODEL;
  document.getElementById("llmContextBefore").value = config.LLM_CONTEXT_BEFORE;
  document.getElementById("llmContextAfter").value = config.LLM_CONTEXT_AFTER;
  document.getElementById("realtimeToggle").checked = config.REALTIME;
}

function updateConfig() {
  let transcriptionUrl = document.getElementById("transcriptionUrl").value;

  if (!isValidUrl(transcriptionUrl)) {
    alert("Invalid Transcription URL");
    return;
  }

  let transcriptionApiKey = document.getElementById(
    "transcriptionApiKey"
  ).value;

  let llmUrl = document.getElementById("llmUrl").value;

  if (!isValidUrl(llmUrl)) {
    alert("Invalid LLM URL");
    return;
  }

  let llmModel = document.getElementById("llmModel").value;
  let llmContextBefore = document.getElementById("llmContextBefore").value;
  let llmContextAfter = document.getElementById("llmContextAfter").value;

  let realtime = document.getElementById("realtimeToggle").checked;

  config.TRANSCRIPTION_URL = transcriptionUrl;
  config.TRANSCRIPTION_API_KEY = transcriptionApiKey;
  config.LLM_URL = llmUrl;
  config.LLM_MODEL = llmModel;
  config.LLM_CONTEXT_BEFORE = llmContextBefore;
  config.LLM_CONTEXT_AFTER = llmContextAfter;
  config.REALTIME = realtime;

  saveConfig(config).then(function () {
    Logger.info("configuration saved!");
    alert("configuration saved!");
    chrome.tabs.getCurrent(function (tab) {
      chrome.tabs.remove(tab.id, function () {});
    });
  });
}

document.addEventListener("DOMContentLoaded", async function (event) {
  config = await loadConfig();
  showConfig();
});

// Save configuration
document.getElementById("saveConfig").addEventListener("click", updateConfig);
