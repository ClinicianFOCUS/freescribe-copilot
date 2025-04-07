import {loadConfig, saveConfig} from "../src/config.js";
import {isValidUrl} from "../src/helpers.js";

// variables for the configuration settings
let config;
const customModelKey = "custom";

// Function: getOptionsFromArray - Get the html options from an array of models
// Map the array of models to an array of option elements and join them
// This function is used to set the options for the select element
function getOptionsFromArray(array) {
    // Map the array of models to an array of option elements and join them
    return array.map(
        (model) => `<option value="${model}">${model}</option>`
    ).join("");
}

// Function: loadRemoteModels - Load the list of models available on the remote server
// Fetch the list of models from the server and set the options and the selected value
function loadRemoteModels(baseUrl) {
    const llmServerModelSelect = document.getElementById("llmModel");
    // Fetch the list of models from the server
    fetch(baseUrl + "/models").then((response) => {
        if (response.ok) {
            response.json().then((data) => {
                let models = data.data.map((model) => model.id);

                // Set the options and the selected value
                llmServerModelSelect.innerHTML = getOptionsFromArray(models);
                llmServerModelSelect.value = config.LLM_MODEL;
            });
        } else {
            llmServerModelSelect.innerHTML = "<option value=''>Error: Unable to load models</option>";
            llmServerModelSelect.value = "";
        }
    }).catch(() => {
        llmServerModelSelect.innerHTML = "<option value=''>Error: Unable to load models</option>";
        llmServerModelSelect.value = "";
    });
}


// Function: loadRemoteModelsOnSettingsChange - Load the remote models when the settings change
// Get the URL from the input field and load the models
// Check if the URL is valid before loading the models
// This function is called when the URL input field loses focus or the refresh button is clicked
function loadRemoteModelsOnSettingsChange() {
    const llmUrl = document.getElementById("llmUrl").value.replace(/\/$/, "");

    // Check if the URL is valid before loading the models
    if (isValidUrl(llmUrl)) {
        loadRemoteModels(llmUrl);
    }
}

// Function: showConfig - Show the configuration settings on the options page based on the saved configuration
// Set the values of the form elements based on the configuration settings
// Load the models based on the configuration settings
// Toggle the settings based on the configuration settings
function showConfig() {
    // Transcription settings
    document.getElementById("transcriptionLocal").checked = config.TRANSCRIPTION_LOCAL;

    const transcriptionLocalModelSelect = document.getElementById("transcriptionLocalModel");
    transcriptionLocalModelSelect.innerHTML = getOptionsFromArray([...config.TRANSCRIPTION_LOCAL_MODELS, customModelKey]);

    if (config.TRANSCRIPTION_LOCAL_MODELS.includes(config.TRANSCRIPTION_LOCAL_MODEL)) {
        transcriptionLocalModelSelect.value = config.TRANSCRIPTION_LOCAL_MODEL;
    } else {
        transcriptionLocalModelSelect.value = customModelKey;
    }

    document.getElementById("transcriptionUrl").value = config.TRANSCRIPTION_URL;
    document.getElementById("transcriptionApiKey").value = config.TRANSCRIPTION_API_KEY;

    toggleTranscriptionSettings();

    // LLM settings
    document.getElementById("llmLocal").checked = config.LLM_LOCAL;

    const llmLocalModelSelect = document.getElementById("llmLocalModel");
    llmLocalModelSelect.innerHTML = getOptionsFromArray([...config.LLM_LOCAL_MODELS, customModelKey]);

    if (config.LLM_LOCAL_MODELS.includes(config.LLM_LOCAL_MODEL)) {
        llmLocalModelSelect.value = config.LLM_LOCAL_MODEL;
    } else {
        llmLocalModelSelect.value = customModelKey;
    }

    document.getElementById("llmUrl").value = config.LLM_URL;
    document.getElementById("llmApiKey").value = config.LLM_API_KEY;

    //toggle the LLM settings based on the local or server option
    toggleLLMSettings();

    // Set the LLM context settings
    document.getElementById("llmContextBefore").value = config.LLM_CONTEXT_BEFORE;
    document.getElementById("llmContextAfter").value = config.LLM_CONTEXT_AFTER;

    // Realtime settings
    document.getElementById("realtimeToggle").checked = config.REALTIME;
    document.getElementById("realtimeRecordingLength").value = config.REALTIME_RECODING_LENGTH;

    // Silence detection settings
    document.getElementById("silenceThreshold").value = config.SILENCE_THRESHOLD;
    document.getElementById("sliderOutput").textContent = config.SILENCE_THRESHOLD;
    document.getElementById("minSilenceDuration").value = config.MIN_SILENCE_DURATION;

    // Debug mode settings
    document.getElementById("debugMode").checked = config.DEBUG_MODE;

    // Pre-processing settings
    document.getElementById("preProcessing").checked = config.PRE_PROCESSING;
    document.getElementById("preProcessingPrompt").value = config.PRE_PROCESSING_PROMPT;

    // toggle the pre-processing settings based on the checkbox
    togglePreProcessingSettings();

    // Post-processing settings
    document.getElementById("postProcessing").checked = config.POST_PROCESSING;
    document.getElementById("postProcessingPrompt").value = config.POST_PROCESSING_PROMPT;
    // toggle the post-processing settings based on the checkbox
    togglePostProcessingSettings();

    document.getElementById("minimumWordCountCheck").checked = config.MINIMUM_WORD_COUNT_CHECK;
    document.getElementById("minimumWordCountLimit").value = config.MINIMUM_WORD_COUNT_LIMIT;

    toggleMinimumWordCountLimit();
}


// Function: showHideSettings - Show or hide the settings based on the selector and classes
function showHideSettings(selector, add_class, remove_class) {
    document.querySelectorAll(selector).forEach((e) => {
        e.classList.remove(remove_class);
        e.classList.add(add_class);
    });
}

// Function: formValidations - Enable or disable the required attribute for the form elements
function formValidations(selector, value) {
    document.querySelectorAll(selector).forEach((e) => {
        e.required = value;
    });
}

// Function: toggleTranscriptionSettings - Toggle the transcription settings based on the local or server option
// Enable or disable the required attribute for the form elements
// Show or hide the settings based on the selector and classes
// Change validation based on the checkbox
function toggleTranscriptionSettings() {
    // Check if the transcription is local or server
    if (document.getElementById("transcriptionLocal").checked) {
        showHideSettings(".transcriptionLocalSettings", "visible", "hidden");
        showHideSettings(".transcriptionServerSettings", "hidden", "visible");
        formValidations('.transcription-local-form', true);
        formValidations('.transcription-server-form', false);

        let transcriptionLocalModelSelect = document.getElementById("transcriptionLocalModel");

        if (transcriptionLocalModelSelect.value === customModelKey) {
            document.getElementById('transcriptionLocalModelCustom').value = config.TRANSCRIPTION_LOCAL_MODEL;
            showHideSettings(".transcriptionLocalCustomSettings", "visible", "hidden");
            formValidations('#transcriptionLocalModelCustom', true);
        } else {
            showHideSettings(".transcriptionLocalCustomSettings", "hidden", "visible");
            formValidations('#transcriptionLocalModelCustom', false);
        }
    } else {
        showHideSettings(".transcriptionLocalSettings", "hidden", "visible");
        showHideSettings(".transcriptionServerSettings", "visible", "hidden");
        formValidations('.transcription-local-form', false);
        formValidations('.transcription-server-form', true);
    }
}

// Function: toggleLLMSettings - Toggle the LLM settings based on the local or server option
// Enable or disable the required attribute for the form elements
// Show or hide the settings based on the selector and classes
// Change validation based on the checkbox
function toggleLLMSettings() {
    // Check if the LLM is local or server
    if (document.getElementById("llmLocal").checked) {
        showHideSettings(".llmLocalSettings", "visible", "hidden");
        showHideSettings(".llmServerSettings", "hidden", "visible");
        formValidations('.llm-local-form', true);
        formValidations('.llm-server-form', false);

        let llmLocalModelSelect = document.getElementById("llmLocalModel");

        if (llmLocalModelSelect.value === customModelKey) {
            document.getElementById('llmLocalModelCustom').value = config.LLM_LOCAL_MODEL;
            showHideSettings(".llmLocalCustomSettings", "visible", "hidden");
            formValidations('#llmLocalModelCustom', true);
        } else {
            showHideSettings(".llmLocalCustomSettings", "hidden", "visible");
            formValidations('#llmLocalModelCustom', false);
        }
    } else {
        showHideSettings(".llmLocalSettings", "hidden", "visible");
        showHideSettings(".llmServerSettings", "visible", "hidden");
        formValidations('.llm-local-form', false);
        formValidations('.llm-server-form', true);
        loadRemoteModelsOnSettingsChange();
    }
}

// Function: togglePreProcessingSettings - Toggle the pre-processing settings based on the checkbox
// Enable or disable the required attribute for the form elements
// Show or hide the settings based on the selector and classes
// Change validation based on the checkbox
function togglePreProcessingSettings() {
    // Check if the pre-processing is enabled
    if (document.getElementById("preProcessing").checked) {
        showHideSettings(".pre-processing-settings", "visible", "hidden");
        formValidations(".pre-processing-form", true);
    } else {
        showHideSettings(".pre-processing-settings", "hidden", "visible");
        formValidations(".pre-processing-form", false);
    }
}

// Function: togglePostProcessingSettings - Toggle the post-processing settings based on the checkbox
// Enable or disable the required attribute for the form elements
// Show or hide the settings based on the selector and classes
// Change validation based on the checkbox
function togglePostProcessingSettings() {
    // Check if the post-processing is enabled
    if (document.getElementById("postProcessing").checked) {
        showHideSettings(".post-processing-settings", "visible", "hidden");
        formValidations(".post-processing-form", true);
    } else {
        showHideSettings(".post-processing-settings", "hidden", "visible");
        formValidations(".post-processing-form", false);
    }
}

function toggleMinimumWordCountLimit() {
    const isChecked = document.getElementById("minimumWordCountCheck").checked;
    const limitInput = document.getElementById("minimumWordCountLimit").parentElement;
    limitInput.style.display = isChecked ? "block" : "none";
}

// Function: updateConfig - Update the configuration settings based on the form inputs
// Save the configuration settings and close the tab
function updateConfig() {
    // Transcription settings
    config.TRANSCRIPTION_LOCAL = document.getElementById("transcriptionLocal").checked;
    config.TRANSCRIPTION_LOCAL_MODEL = document.getElementById("transcriptionLocalModel").value;

    if (config.TRANSCRIPTION_LOCAL_MODEL === customModelKey) {
        config.TRANSCRIPTION_LOCAL_MODEL = document.getElementById("transcriptionLocalModelCustom").value;
    }

    config.TRANSCRIPTION_URL = document.getElementById("transcriptionUrl").value;
    config.TRANSCRIPTION_API_KEY = document.getElementById("transcriptionApiKey").value;

    // LLM settings
    config.LLM_LOCAL = document.getElementById("llmLocal").checked;
    config.LLM_LOCAL_MODEL = document.getElementById("llmLocalModel").value;

    if (config.LLM_LOCAL_MODEL === customModelKey) {
        config.LLM_LOCAL_MODEL = document.getElementById("llmLocalModelCustom").value;
    }

    config.LLM_URL = document.getElementById("llmUrl").value.replace(/\/$/, "");
    config.LLM_API_KEY = document.getElementById("llmApiKey").value;

    config.LLM_MODEL = document.getElementById("llmModel").value;
    config.LLM_CONTEXT_BEFORE = document.getElementById("llmContextBefore").value;
    config.LLM_CONTEXT_AFTER = document.getElementById("llmContextAfter").value;
    config.REALTIME = document.getElementById("realtimeToggle").checked;
    config.REALTIME_RECODING_LENGTH = parseInt(document.getElementById("realtimeRecordingLength").value);
    config.SILENCE_THRESHOLD = parseFloat(document.getElementById("silenceThreshold").value);
    config.MIN_SILENCE_DURATION = parseInt(document.getElementById("minSilenceDuration").value);
    config.DEBUG_MODE = document.getElementById("debugMode").checked;

    // Pre-processing settings
    config.PRE_PROCESSING = document.getElementById("preProcessing").checked;
    config.PRE_PROCESSING_PROMPT = document.getElementById("preProcessingPrompt").value;

    // Post-processing settings
    config.POST_PROCESSING = document.getElementById("postProcessing").checked;
    config.POST_PROCESSING_PROMPT = document.getElementById("postProcessingPrompt").value;

    config.MINIMUM_WORD_COUNT_CHECK = document.getElementById("minimumWordCountCheck").checked;
    config.MINIMUM_WORD_COUNT_LIMIT = parseInt(document.getElementById("minimumWordCountLimit").value, 10);

    // Save configuration
    saveConfig(config).then(function () {
        // send message to background.js to reload the extension
        chrome.runtime.sendMessage({target: 'background', type: "reload-extension"});
        alert("Configuration saved! Please restart the extension for the settings to take effect.");
        closeTab(); // Close the tab after saving
    });
}

// Function: closeTab - Close the current tab after saving the configuration
function closeTab() {
    chrome.tabs.getCurrent(function (tab) {
        chrome.tabs.remove(tab.id, function () {
        });
    });
}

// Event listener for the document ready event
// Load the configuration settings and show them on the options page
// Initialize the tooltips
// Add custom URL validation method for the form
// Event listener for the silence threshold slider to update the value
// Form validation for the configuration settings
// Event listeners for the checkboxes
document.addEventListener("DOMContentLoaded", async function (event) {
    $('[data-toggle="tooltip"]').tooltip(); // Initialize tooltips

    // Load the configuration settings
    config = await loadConfig();

    // Show the configuration settings on the options page
    showConfig();

    // Custom URL validation method for the form
    $.validator.addMethod(
        "customUrl",
        function (value, element) {
            return this.optional(element) || isValidUrl(value);
        },
        "Please enter a valid URL."
    );

    // Event listener for the silence threshold slider to update the value
    document.getElementById("silenceThreshold").addEventListener("change", function () {
        document.getElementById("sliderOutput").textContent = this.value;
    });

    // Form validation for the configuration settings
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
                max: 30,
            },
            silenceThreshold: {
                required: true,
                min: 0.01,
                max: 0.1,
            },
            minSilenceDuration: {
                required: true,
                min: 500,
                max: 2000,
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
            llmUrl: {
                required: "Please enter the LLM URL.",
                customUrl: "Please enter a valid URL format for the LLM.",
            },
            llmModel: {
                required: "Please select the LLM Model.",
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

    // Event listeners for the checkboxes
    document.getElementById("transcriptionLocal").addEventListener("change", toggleTranscriptionSettings);
    document.getElementById("transcriptionLocalModel").addEventListener("change", toggleTranscriptionSettings);
    document.getElementById("llmLocal").addEventListener("change", toggleLLMSettings);
    document.getElementById("llmLocalModel").addEventListener("change", toggleLLMSettings);
    document.getElementById("preProcessing").addEventListener("change", togglePreProcessingSettings);
    document.getElementById("postProcessing").addEventListener("change", togglePostProcessingSettings);
    document.getElementById("minimumWordCountCheck").addEventListener("change", toggleMinimumWordCountLimit);

    // listen to when the LLM server settings change and update the models
    document.getElementById("llmUrl").addEventListener("focusout", loadRemoteModelsOnSettingsChange);
    document.getElementById("llmModelRefresh").addEventListener("click", loadRemoteModelsOnSettingsChange);
});

// Close without saving
document.getElementById("closeButton").addEventListener("click", closeTab);
