export const defaultConfig = {
  TRANSCRIPTION_URL: "http://localhost:8000/whisperaudio",
  TRANSCRIPTION_API_KEY: "your_api_key",
  LLM_URL: "http://localhost:1337/v1/chat/completions",
  LLM_MODEL: "gemma-2-2b-it",
  LLM_CONTEXT_BEFORE:
    "AI, please transform the following conversation into a concise SOAP note. Do not assume any medical data, vital signs, or lab values. Base the note strictly on the information provided in the conversation. Ensure that the SOAP note is structured appropriately with Subjective, Objective, Assessment, and Plan sections. Strictly extract facts from the conversation. Here's the conversation:",
  LLM_CONTEXT_AFTER:
    "Remember, the Subjective section should reflect the patient's perspective and complaints as mentioned in the conversation. The Objective section should only include observable or measurable data from the conversation. The Assessment should be a summary of your understanding and potential diagnoses, considering the conversation's content. The Plan should outline the proposed management, strictly based on the dialogue provided. Do not add any information that did not occur and do not make assumptions. Strictly extract facts from the conversation.",
  REALTIME: false,
  REALTIME_RECODING_LENGTH: 5,
  SILENCE_THRESHOLD: 0.01,
  MIN_SILENCE_DURATION: 500,
  ENABLE_LOGGING: true,
};

export function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["config"], function (result) {
      console.info("configuration loaded!");
      resolve({ ...defaultConfig, ...result.config });
    });
  });
}

export async function getConfig(key) {
  let config = loadConfig();

  return config[key];
}

export function saveConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ config: config }, resolve);
  });
}
