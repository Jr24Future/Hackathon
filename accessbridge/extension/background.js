//This file will run as the extension background server worker
// basically it's going to listen for extensions icon clicks keyboard shortcuts and a message from content.js

//get the current active tab
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tab;
}

// opens the extension in the current web page it's going to work by injecting contents.JS and panel.CSS into the active tab 
async function openAccessBridge(tab) {
  if (!tab || !tab.id || tab.url?.startsWith("chrome://")) { //note! from internal page cannot be modified by extensions 
    return;
  }

  await chrome.scripting.executeScript({ //injects the content (display and reads the webpage)
    target: { tabId: tab.id },
    files: ["content.js"]
  });

  await chrome.scripting.insertCSS({ // injects the CSS 
    target: { tabId: tab.id },
    files: ["panel.css"]
  });

  await chrome.tabs.sendMessage(tab.id, { //send a message telling it's open
    type: "ACCESSBRIDGE_OPEN"
  });
}

chrome.commands.onCommand.addListener(async (command) => {  // listener for keyboard shortcuts (from manifest.json)
  if (command === "open-accessbridge") {
    const tab = await getCurrentTab();
    await openAccessBridge(tab);
  }
});

chrome.action.onClicked.addListener(async (tab) => { // listens for clicking in the extension 
  await openAccessBridge(tab);
});

// listens from messages from content.js due to it keeps on crashing caused by not being able to handle the back end call 
//made it so it sends the summary request here and the background calls the back end at 3000 
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SUMMARIZE_TEXT") {
    // calls open AI API and returns a summary 
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
        sendResponse({  //sends the successful summary result back to content.js
          ok: true,
          data
        });
      })
      .catch((error) => {   // fail safe
        console.error("AccessBridge backend fetch failed:", error); 

        sendResponse({
          ok: false,
          error: error.message
        });
      });

      //note return true required because fetch is asynchronous keeps the message channel open until saySO.
    return true;
  }
});