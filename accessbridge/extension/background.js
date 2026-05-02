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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SUMMARIZE_TEXT") {
    fetch("http://localhost:3000/summarize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message.payload)
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Backend request failed");
        }

        return response.json();
      })
      .then((data) => {
        sendResponse({
          ok: true,
          data
        });
      })
      .catch((error) => {
        console.error("AccessBridge backend fetch failed:", error);

        sendResponse({
          ok: false,
          error: error.message
        });
      });

    return true;
  }
});