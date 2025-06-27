import {
    pipeline, WhisperTextStreamer, InterruptableStoppingCriteria,
} from "./transformers.min.js";

// Define model factories
// Ensures only one model is created of each type

const text2speech = "s2t";
const llm = "llm";
const stopping_criteria = new InterruptableStoppingCriteria();
let isRecording = false;

class TranslationPipeline {
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

async function loadSpeech2Text(model) {
    self.postMessage({
        type: text2speech, status: "loading", message: "Loading model...",
    });

    const p = TranslationPipeline;
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

async function transcribe(audio) {
    if (isRecording) {
        return;
    }
    isRecording = true;

    self.postMessage({
        type: text2speech, status: "start",
    });

    // Load transcriber model
    const transcriber = await TranslationPipeline.getInstance((data) => {
        data.type = text2speech;
        self.postMessage(data);
    });

    const chunk_length_s = 30;
    const stride_length_s = 5;

    const time_precision = transcriber.processor.feature_extractor.config.chunk_length / transcriber.model.config.max_source_positions;

    // Storage for chunks to be processed. Initialise with an empty chunk.
    /** @type {{ text: string; offset: number, timestamp: [number, number | null] }[]} */
    const chunks = [];

    // TODO: Storage for fully-processed and merged chunks
    // let decoded_chunks = [];

    let chunk_count = 0;
    let start_time;
    let num_tokens = 0;
    let tps;
    const streamer = new WhisperTextStreamer(transcriber.tokenizer, {
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

            // self.postMessage({
            //   type: text2speech,
            //   status: "update",
            //   data: {
            //     text: "", // No need to send full text yet
            //     chunks,
            //     tps,
            //   },
            // });
        }, on_chunk_end: (x) => {
            const current = chunks.at(-1);
            current.timestamp[1] = x + current.offset;
            current.finalised = true;
        }, on_finalize: () => {
            start_time = null;
            num_tokens = 0;
            ++chunk_count;
        },
    });

    // Actually run transcription
    const output = await transcriber(audio, {
        // Greedy
        top_k: 0, do_sample: false,

        // Sliding window
        chunk_length_s, stride_length_s,

        // Language and task

        // Return timestamps
        return_timestamps: true, force_full_sequences: false,

        // Callback functions
        streamer, // after each generation step
    }).catch((error) => {
        console.error(error);
        self.postMessage({
            type: text2speech, status: "error", data: error,
        });
        return null;
    });

    self.postMessage({
        type: text2speech, status: "complete", data: {
            text: output.text, // No need to send full text yet
            chunks, tps,
        },
    });
    isRecording = false;
}

class LlmPipeline {
    static task = "text-generation";
    static model = "onnx-community/Phi-3.5-mini-instruct-onnx-web";
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

async function loadLlm(model) {
    try {
        // Tell the main thread we are starting
        self.postMessage({
            type: "llm", 
            status: "loading", 
            message: "Loading model...",
        });
        
        const p = LlmPipeline;
        
        if (p.model !== model) {
            // Invalidate model if different
            p.model = model;
            if (p.instance !== null) {
                try {
                    (await p.getInstance()).dispose();
                } catch (disposeError) {
                    console.warn("Error disposing previous instance:", disposeError);
                }
                p.instance = null;
            }
        }
        
        // Load the pipeline and save it for future use.
        await p.getInstance((x) => {
            // We also add a progress callback to the pipeline so that we can
            // track model loading.
            x.type = "llm";
            self.postMessage(x);
        });
        
        // Tell the main thread we are ready
        self.postMessage({type: "llm", status: "ready"});
        
    } catch (error) {
        console.error("Error loading LLM:", error);
        self.postMessage({
            type: "llm", 
            status: "error", 
            message: `Failed to load model: ${error.message}`,
            error: error.toString()
        });
    }
}

async function generate(data) {
    const {message, type, extra} = data;
    // Retrieve the text-generation pipeline.
    const generator = await LlmPipeline.getInstance();

    // Tell the main thread we are starting
    self.postMessage({type: llm, status: "start"});

    const prompt = [{role: "user", content: message}];

    const result = await generator(prompt, {max_new_tokens: 128});

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

    self.postMessage({
        type: llm, status: "complete", data: {
            type: type, text: outputText, extra: extra,
        },
    });
}

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
            stopping_criteria.reset();
            generate(data);
            break;
        case "interrupt":
            stopping_criteria.interrupt();
            break;

        case "reset":
            // past_key_values_cache = null;
            stopping_criteria.reset();
            break;
    }
});
