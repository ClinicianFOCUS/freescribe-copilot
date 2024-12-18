// Description: This file contains the SilenceDetector class which is responsible for detecting silence in audio data.
// It also contains a method to check if audio is available in a Blob array.

export class SilenceDetector {

  // Function: constructor - Initialize the silence detector with the configuration settings
  constructor(config) {
    this.config = config;
    this.silenceStart = null;
  }

  // Function: detect - Detect silence in the input audio data
  detect(inputData, currentTime) {
    const average = this.calculateAverage(inputData);
    if (average < this.config.SILENCE_THRESHOLD) {
      return this.handleSilence(currentTime);
    }
    this.silenceStart = null;
    return false;
  }

  // Function: calculateAverage - Calculate the average length of the input data
  calculateAverage(inputData) {
    let total = 0;
    for (let i = 0; i < inputData.length; i++) {
      total += Math.abs(inputData[i]);
    }
    return total / inputData.length;
  }

  // Function: handleSilence - Handle silence in the audio data based on the current time
  // and the silence start time and compare it with the minimum silence duration
  handleSilence(currentTime) {
    if (this.silenceStart === null) {
      this.silenceStart = currentTime;
      return false;
    }
    const silenceDuration = currentTime - this.silenceStart;
    return silenceDuration > this.config.MIN_SILENCE_DURATION;
  }

  // Function: isAudioAvailable - Check if audio is available in the Blob array by decoding the audio data
  async isAudioAvailable(blobArray) {
    // Create an AudioContext object to decode the audio data
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
