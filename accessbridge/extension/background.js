async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tab;
}

async function openAccessBridge(tab) {
  if (!tab || !tab.id || tab.url?.startsWith("chrome://")) {
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });

  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ["panel.css"]
  });

  await chrome.tabs.sendMessage(tab.id, {
    type: "ACCESSBRIDGE_OPEN"
  });
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-accessbridge") {
    const tab = await getCurrentTab();
    await openAccessBridge(tab);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  await openAccessBridge(tab);
});