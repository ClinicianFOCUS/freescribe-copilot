chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason.search(/install/g) === -1) {
    return;
  }
  chrome.tabs.create({
    url: chrome.runtime.getURL("welcome.html"),
    active: true,
  });

  // Create context menu item
  chrome.contextMenus.create({
    id: "freescribeCopilot",
    title: "Start Freescribe Copilot",
    contexts: ["all"],
    command: "_execute_sidebar_action",
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "freescribeCopilot") {
    console.log("Freescribe Copilot started");
  }
});

chrome.browserAction.onClicked.addListener(() => {
  // chrome.sidebarAction.open();

  var url = chrome.runtime.getURL("index.html");
  chrome.windows.create(
    {
      url: url,
      type: "popup",
      width: 370,
      height: 700,
    },
    function (w) {}
  );
});
