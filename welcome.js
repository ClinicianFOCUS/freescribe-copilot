navigator.mediaDevices
  .getUserMedia({ audio: true })
  .then((stream) => {
    // Permission granted, handle the stream if needed
    console.log("Microphone access granted");

    // Stop the tracks to prevent the recording indicator from being shown
    stream.getTracks().forEach(function (track) {
      track.stop();
    });
  })
  .catch((error) => {
    console.error("Error requesting microphone permission", error);
  });
