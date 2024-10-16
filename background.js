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
    contexts: ["page", "selection"],
  });
});

function openSidePanel(windowId) {
  chrome.sidePanel.open({ windowId: windowId });
}

chrome.action.onClicked.addListener((tab) => {
  openSidePanel(tab.windowId);
});

// Handle context menu item click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "freescribeCopilot") {
    openSidePanel(tab.windowId);
  }
});
