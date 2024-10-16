class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.silenceThreshold = 0.01; // Adjust as necessary
    this.minSilenceDuration = 500; // Minimum silence duration in ms
    this.recordingStartTime;
    this.silenceStart;
    this.minRecordingLength = 5000;
    this.isRecording = false;

    this.port.onmessage = (event) => {
      console.log(event);
      if (event.data === "START") {
        this.isRecording = true;
        this.recordingStartTime = Date.now();
        this.silenceStart = null;
      } else if (event.data === "STOP") {
        this.isRecording = false;
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (!this.isRecording) {
      return false;
    }
    console.log("this");
    const currentTime = Date.now();
    const recordingDuration = currentTime - this.recordingStartTime;

    if (recordingDuration < this.minRecordingLength) {
      // Don't check for silence during the first 5 seconds
      return true;
    }

    const inputData = inputs[0];
    const inputDataLength = inputData.length;
    let total = 0;

    for (let i = 0; i < inputDataLength; i++) {
      total += Math.abs(inputData[i]);
    }

    const average = total / inputDataLength;

    if (average < this.silenceThreshold) {
      if (this.silenceStart === null) {
        this.silenceStart = currentTime;
      } else {
        const silenceDuration = currentTime - this.silenceStart;
        if (silenceDuration > this.minSilenceDuration) {
          console.log("silence detected");
          this.silenceStart = null;

          this.port.postMessage({
            type: "silence",
          });

          this.recordingStartTime = Date.now(); // Reset the recording start time
        }
      }
    } else {
      console.log("voice detected");
      this.silenceStart = null;
    }

    return true;
  }
}

registerProcessor("audio-processor", AudioProcessor);
