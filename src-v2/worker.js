// Description: Web worker for running speech-to-text and language model tasks.
// This file contains the code for the web worker that runs speech-to-text and language model tasks.
// It listens for messages from the main thread and performs the required tasks.
// It uses the transformers library to run the speech-to-text and language model tasks.
// It sends messages back to the main thread with the results of the tasks.

import {
    pipeline, WhisperTextStreamer
} from "./transformers.min.js";

// flag to prevent multiple transcriptions at once
let isTranscribing = false;

// Define message types
const text2speech = "s2t";
const llm = "llm";

// Define model factories
// Ensures only one model is created of each type
// provides progress callback to track model loading
// and dispose of the model when it is no longer neededS
class TranscriptionPipeline {
    static task = "automatic-speech-recognition";
    static model = "onnx-community/whisper-base";
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = pipeline(this.task, this.model, {
                dtype: {
                    encoder_model: this.model === "onnx-community/whisper-large-v3-turbo" ? "fp16" : "fp32",
                    decoder_model_merged: "q4", // or 'fp32' ('fp16' is broken)
                }, device: "webgpu", progress_callback,
            });
        }

        return this.instance;
    }
}

// Function: loadSpeech2Text - Load the speech-to-text model.
// Load the speech-to-text model and save it for future use.
// Send messages to the main thread to track the progress of the model loading.
// Send a message to the main thread when the model is loaded and ready.
async function loadSpeech2Text(model) {
    self.postMessage({
        type: text2speech, status: "loading", message: "Loading model...",
    });

    const p = TranscriptionPipeline;
    if (p.model !== model) {
        // Invalidate model if different
        p.model = model;

        if (p.instance !== null) {
            (await p.getInstance()).dispose();
            p.instance = null;
        }
    }

    await p.getInstance((x) => {
        // We also add a progress callback to the pipeline so that we can
        // track model loading.
        x.type = text2speech;
        self.postMessage(x);
    });

    self.postMessage({type: text2speech, status: "ready"});
}

// Function: transcribe - Transcribe the audio to text.
// Transcribe the audio to text using the speech-to-text model.
// Send messages to the main thread to track the progress of the transcription.
// Send a message to the main thread when the transcription is complete.
// Prevent multiple transcriptions from running at once.
// Chunk the audio and process it in chunks to improve performance.
async function transcribe(data) {
    if (isTranscribing) {
        return;
    }

    const {audio, translate} = data;

    isTranscribing = true;

    // Tell the main thread we are starting
    self.postMessage({
        type: text2speech, status: "start",
    });

    // Load transcriber model
    const transcriber = await TranscriptionPipeline.getInstance((data) => {
        data.type = text2speech;
        self.postMessage(data);
    });

    // Define chunk and stride lengths in seconds
    const chunk_length_s = 30;
    const stride_length_s = 5;
    const time_precision = transcriber.processor.feature_extractor.config.chunk_length / transcriber.model.config.max_source_positions;

    // Storage for chunks to be processed. Initialise with an empty chunk.
    /** @type {{ text: string; offset: number, timestamp: [number, number | null] }[]} */
    const chunks = [];

    // Variables to keep track of progress
    let chunk_count = 0;
    let start_time;
    let num_tokens = 0;
    let tps;

    let transcriberOptions = {
        time_precision, on_chunk_start: (x) => {
            const offset = (chunk_length_s - stride_length_s) * chunk_count;
            chunks.push({
                text: "", timestamp: [offset + x, null], finalised: false, offset,
            });
        }, token_callback_function: (x) => {
            start_time ??= performance.now();
            if (num_tokens++ > 0) {
                tps = (num_tokens / (performance.now() - start_time)) * 1000;
            }
        }, callback_function: (x) => {
            if (chunks.length === 0) {
                return;
            }
            // Append text to the last chunk
            chunks.at(-1).text += x;
        }, on_chunk_end: (x) => {
            const current = chunks.at(-1);
            current.timestamp[1] = x + current.offset;
            current.finalised = true;
        }, on_finalize: () => {
            start_time = null;
            num_tokens = 0;
            ++chunk_count;
        },
    }

    if (translate) {
        // Set the language model to use for transcription
        transcriberOptions.language = "en";
        transcriberOptions.task = "translate";
    }

    // Create a streamer to process the text in chunks
    const streamer = new WhisperTextStreamer(transcriber.tokenizer, transcriberOptions);

    // Actually run transcription
    const output = await transcriber(audio, {
        // Greedy
        top_k: 0, do_sample: false,

        // Sliding window
        chunk_length_s, stride_length_s,

        // Return timestamps
        return_timestamps: true, force_full_sequences: false,

        // Callback functions
        streamer, // after each generation step
    }).catch((error) => {
        console.error(error);
        isTranscribing = false;
        self.postMessage({
            type: text2speech, status: "error", data: error,
        });
        return null;
    });

    // Post the transcription back to the main thread
    self.postMessage({
        type: text2speech, status: "complete", data: {
            text: output.text, // No need to send full text yet
            chunks, tps,
        },
    });
    isTranscribing = false;
}

// Define model factories
// Ensures only one model is created of each type
// provides progress callback to track model loading
// and dispose of the model when it is no longer needed
class LlmPipeline {
    static task = "text-generation";
    static model = "onnx-community/Llama-3.2-1B-Instruct-q4f16";
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = pipeline(this.task, this.model, {
                dtype: "q4f16", device: "webgpu", progress_callback,
            });
        }

        return this.instance;
    }
}

// Function: loadLlm - Load the language model.
// Load the language model and save it for future use.
// Send messages to the main thread to track the progress of the model loading.
// Send a message to the main thread when the model is loaded and ready.
async function loadLlm(model) {
    // Tell the main thread we are starting
    self.postMessage({
        type: llm, status: "loading", message: "Loading model...",
    });

    const p = LlmPipeline;
    if (p.model !== model) {
        // Invalidate model if different
        p.model = model;

        if (p.instance !== null) {
            (await p.getInstance()).dispose();
            p.instance = null;
        }
    }

    // Load the pipeline and save it for future use.
    await p.getInstance((x) => {
        // We also add a progress callback to the pipeline so that we can
        // track model loading.
        x.type = llm;
        self.postMessage(x);
    });

    // Tell the main thread we are ready
    self.postMessage({type: llm, status: "ready"});
}

// Function: generate - Generate text using the language model.
// Generate text using the language model based on the input data.
// Send messages to the main thread to track the progress of the generation.
// Send a message to the main thread when the generation is complete.
async function generate(data) {
    const {message, type, extra} = data;
    // Retrieve the text-generation pipeline.
    const generator = await LlmPipeline.getInstance();

    // Tell the main thread we are starting
    self.postMessage({type: llm, status: "start"});

    // Generate the prompt for the language model.
    const prompt = [{role: "user", content: message}];

    // Generate the response using the language model.
    const result = await generator(prompt, {max_new_tokens: 128});

    // Retrieve the generated text from the result.
    let outputText;
    try {
        const lastGenerated = result[0]?.generated_text?.at(-1);
        if (!lastGenerated) {
            throw new Error("No generated text available");
        }
        outputText = lastGenerated.content;
    } catch (error) {
        outputText = "Failed to generate response";
    }

    // Post the generated text back to the main thread.
    self.postMessage({
        type: llm, status: "complete", data: {
            type: type, text: outputText, extra: extra,
        },
    });
}

// Listen for messages from the main thread and perform the required tasks.
self.addEventListener("message", async (event) => {
    const {type, data} = event.data;

    switch (type) {
        case "load_s2t":
            loadSpeech2Text(data);
            break;
        case "transcribe":
            transcribe(data);
            break;
        case "load_llm":
            loadLlm(data);
            break;
        case "generate":
            generate(data);
            break;
    }
});
