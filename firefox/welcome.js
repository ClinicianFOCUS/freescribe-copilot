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

document.addEventListener("DOMContentLoaded", function () {
  const configureLink = document.getElementById("configureLink");

  configureLink.addEventListener("click", function (e) {
    e.preventDefault();
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL("options.html"));
    }
  });
});
