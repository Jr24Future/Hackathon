//This file will run as the extension background server worker
// basically it's going to listen for extensions icon clicks keyboard shortcuts and a message from content.js

const ACCESSBRIDGE_BACKEND_URL = "https://visa-schilling-caloric.ngrok-free.dev";

// ngrok / makes every backend request use the same headers.
function getBackendHeaders(extraHeaders = {}) {
  return {
    "ngrok-skip-browser-warning": "true",
    ...extraHeaders
  };
}

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

  await chrome.tabs.sendMessage(tab.id, { //send a message telling it to open or close
    type: "ACCESSBRIDGE_TOGGLE"
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


async function fetchJson(path, options = {}) {
  const response = await fetch(`${ACCESSBRIDGE_BACKEND_URL}${path}`, {
    ...options,
    headers: getBackendHeaders(options.headers || {})
  });

  if (!response.ok) {
    let errorMessage = `Backend request failed with status ${response.status}`;

    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.details || errorMessage;
    } catch (error) {   // keep the basic status message if the body is not JSON
    }

    throw new Error(errorMessage);
  }

  return response.json();
}

// listens from messages from content.js due to it keeps on crashing caused by not being able to handle the back end call 
//made it so it sends the summary request here and the background calls the back end at 3000 
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PING_BACKEND") {
    fetchJson("/health")
      .then((data) => {
        sendResponse({
          ok: true,
          data
        });
      })
      .catch((error) => {
        console.error("AccessBridge backend health check failed:", error);

        sendResponse({
          ok: false,
          error: error.message
        });
      });

    return true;
  }

  if (message.type === "SUMMARIZE_TEXT") {
    // calls the local/ngrok backend and returns a summary 
    fetchJson("/summarize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message.payload)
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

  if (message.type === "ASK_PAGE") {
    fetchJson("/ask-page", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message.payload)
    })
      .then((data) => {
        sendResponse({
          ok: true,
          data
        });
      })
      .catch((error) => {
        console.error("AccessBridge ask-page request failed:", error);

        sendResponse({
          ok: false,
          error: error.message
        });
      });

    return true;
  }

  if (message.type === "NATURAL_TTS") {
    fetchJson("/natural-voice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message.payload)
    })
      .then((data) => {
        sendResponse({
          ok: true,
          data
        });
      })
      .catch((error) => {
        console.error("AccessBridge natural voice request failed:", error);

        sendResponse({
          ok: false,
          error: error.message
        });
      });

    return true;
  }

  //when content.js asks for image analysis it will capture the visible tab and send it to the backend.
  if (message.type === "ANALYZE_VISIBLE_SCREENSHOT") {
    chrome.tabs.captureVisibleTab(
      sender.tab.windowId,
      {
        format: "jpeg",
        quality: 70
      },
      async (imageDataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            ok: false,
            error: chrome.runtime.lastError.message
          });
          return;
        }

        try {
          const data = await fetchJson("/analyze-image", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ imageDataUrl })
          });

          sendResponse({
            ok: true,
            data
          });
        } catch (error) {
          console.error("AccessBridge image analysis failed:", error);

          sendResponse({
            ok: false,
            error: error.message
          });
        }
      }
    );

    return true;
  }
});