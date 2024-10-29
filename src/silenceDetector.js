export class SilenceDetector {
  constructor(config) {
    this.config = config;
    this.silenceStart = null;
  }

  detect(inputData, currentTime) {
    const average = this.calculateAverage(inputData);
    if (average < this.config.SILENCE_THRESHOLD) {
      return this.handleSilence(currentTime);
    }
    this.silenceStart = null;
    return false;
  }

  calculateAverage(inputData) {
    let total = 0;
    for (let i = 0; i < inputData.length; i++) {
      total += Math.abs(inputData[i]);
    }
    return total / inputData.length;
  }

  handleSilence(currentTime) {
    if (this.silenceStart === null) {
      this.silenceStart = currentTime;
      return false;
    }
    const silenceDuration = currentTime - this.silenceStart;
    return silenceDuration > this.config.MIN_SILENCE_DURATION;
  }

  async isAudioAvailable(blobArray) {
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();

    for (const blob of blobArray) {
      // Convert each Blob to an ArrayBuffer
      const arrayBuffer = await blob.arrayBuffer();

      // Decode the ArrayBuffer to get audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const rawData = audioBuffer.getChannelData(0); // Get the first channel's audio data

      // Check if the audio levels are consistently below the silence threshold
      for (let i = 0; i < rawData.length; i++) {
        if (Math.abs(rawData[i]) > this.config.SILENCE_THRESHOLD) {
          return true;
        }
      }
    }

    return false;
  }
}
