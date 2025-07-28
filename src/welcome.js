// Description: This file contains the code for the welcome page.

// Request microphone access
// This code requests microphone access when the welcome page is opened.
// It stops the tracks to prevent the recording indicator from being shown.
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

// Open the options page when the configure link is clicked
// This code opens the options page when the configure link is clicked.
// It checks if the openOptionsPage function is available and opens the options page accordingly.
document.addEventListener("DOMContentLoaded", function () {
  const configureLink = document.getElementById("configureLink");

  configureLink.addEventListener("click", function (e) {
    e.preventDefault();
    // Open the options page
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL("options.html"));
    }
  });
});
