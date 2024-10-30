import { loadConfig, saveConfig } from "./config.js";
import { isValidUrl, generateBaseUrl } from "./helpers.js";
import { Logger } from "./logger.js";

let config;

function showConfig() {
  // Transcription settings
  document.getElementById("transcriptionHost").value =
    config.TRANSCRIPTION_HOST;
  document.getElementById("transcriptionPort").value =
    config.TRANSCRIPTION_PORT;
  document.getElementById("transcriptionSecure").value =
    config.TRANSCRIPTION_SECURE;
  document.getElementById("transcriptionApiKey").value =
    config.TRANSCRIPTION_API_KEY;

  // LLM settings
  document.getElementById("llmHost").value = config.LLM_HOST;
  document.getElementById("llmPort").value = config.LLM_PORT;
  document.getElementById("llmSecure").value = config.LLM_SECURE;
  document.getElementById("llmModel").value = config.LLM_MODEL;
  document.getElementById("llmContextBefore").value = config.LLM_CONTEXT_BEFORE;
  document.getElementById("llmContextAfter").value = config.LLM_CONTEXT_AFTER;
  document.getElementById("realtimeToggle").checked = config.REALTIME;
  document.getElementById("realtimeRecordingLength").value =
    config.REALTIME_RECODING_LENGTH;
  document.getElementById("silenceThreshold").value = config.SILENCE_THRESHOLD;
  document.getElementById("minSilenceDuration").value =
    config.MIN_SILENCE_DURATION;
  document.getElementById("debugMode").checked = config.DEBUG_MODE;
}

function updateConfig() {
  // Transcription settings
  config.TRANSCRIPTION_HOST =
    document.getElementById("transcriptionHost").value;
  config.TRANSCRIPTION_PORT = parseInt(
    document.getElementById("transcriptionPort").value
  );
  config.TRANSCRIPTION_SECURE = parseInt(
    document.getElementById("transcriptionSecure").value
  );
  config.TRANSCRIPTION_API_KEY = document.getElementById(
    "transcriptionApiKey"
  ).value;

  config.TRANSCRIPTION_URL =
    generateBaseUrl(
      config.TRANSCRIPTION_SECURE,
      config.TRANSCRIPTION_HOST,
      config.TRANSCRIPTION_PORT
    ) + "/whisperaudio";

  // LLM settings
  config.LLM_HOST = document.getElementById("llmHost").value;
  config.LLM_PORT = parseInt(document.getElementById("llmPort").value);
  config.LLM_SECURE = parseInt(document.getElementById("llmSecure").value);

  config.LLM_URL =
    generateBaseUrl(config.LLM_SECURE, config.LLM_HOST, config.LLM_PORT) +
    "/v1/chat/completions";

  config.LLM_MODEL = document.getElementById("llmModel").value;
  config.LLM_CONTEXT_BEFORE = document.getElementById("llmContextBefore").value;
  config.LLM_CONTEXT_AFTER = document.getElementById("llmContextAfter").value;
  config.REALTIME = document.getElementById("realtimeToggle").checked;
  config.REALTIME_RECODING_LENGTH = parseInt(
    document.getElementById("realtimeRecordingLength").value
  );
  config.SILENCE_THRESHOLD = parseFloat(
    document.getElementById("silenceThreshold").value
  );
  config.MIN_SILENCE_DURATION = parseInt(
    document.getElementById("minSilenceDuration").value
  );
  config.DEBUG_MODE = document.getElementById("debugMode").checked;

  // Save configuration
  saveConfig(config).then(function () {
    Logger.info("Configuration saved!");
    alert("Configuration saved!");
    closeTab(); // Close the tab after saving
  });
}

function closeTab() {
  chrome.tabs.getCurrent(function (tab) {
    chrome.tabs.remove(tab.id, function () {});
  });
}

document.addEventListener("DOMContentLoaded", async function (event) {
  config = await loadConfig();
  showConfig();

  // Custom URL validation method
  $.validator.addMethod(
    "customUrl",
    function (value, element) {
      return this.optional(element) || isValidUrl(value);
    },
    "Please enter a valid URL."
  );

  $("#configForm").validate({
    errorClass: "text-danger small",
    rules: {
      transcriptionHost: {
        required: true,
      },
      transcriptionApiKey: {
        required: false,
      },
      llmHost: {
        required: true,
      },
      llmModel: {
        required: true,
      },
      llmContextBefore: {
        required: true,
      },
      llmContextAfter: {
        required: true,
      },
      realtimeRecordingLength: {
        required: true,
        min: 5,
        max: 10,
      },
      silenceThreshold: {
        required: true,
        min: 0,
      },
      minSilenceDuration: {
        required: true,
        min: 500,
      },
    },
    messages: {
      transcriptionHost: {
        required: "Please enter the Transcription Server URL.",
        customUrl:
          "Please enter a valid URL format for the Transcription Server.",
      },
      transcriptionApiKey: {
        required: "Please enter the Transcription Server API Key.",
      },
      llmHost: {
        required: "Please enter the LLM URL.",
        customUrl: "Please enter a valid URL format for the LLM.",
      },
      llmModel: {
        required: "Please enter the LLM Model.",
      },
      llmContextBefore: {
        required: "Please enter the LLM Context used before the prompt.",
      },
      llmContextAfter: {
        required: "Please enter the LLM Context used after the prompt.",
      },
      realtimeRecordingLength: {
        required: "Please enter the Realtime Recording Length.",
        min: "The Realtime Recording Length must be at least 5 seconds.",
        max: "The Realtime Recording Length cannot exceed 10 seconds.",
      },
      silenceThreshold: {
        required: "Please enter the Silence Threshold.",
        min: "The Silence Threshold must be at least 0.",
      },
      minSilenceDuration: {
        required: "Please enter the Minimum Silence Duration.",
        min: "The Minimum Silence Duration must be at least 500 milliseconds.",
      },
    },
    submitHandler: function (form) {
      updateConfig();
    },
  });
});

// Close without saving
document.getElementById("closeButton").addEventListener("click", closeTab);
