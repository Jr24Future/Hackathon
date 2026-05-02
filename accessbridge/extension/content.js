/**
 * this file runs inside the web page when the extension is active it takes care of: 
 * the panel 
 * extracts readable info
 * finds accessibility issues
 * send text to the backend for the summarized part
 * and text to speech 
 */

(() => {
  window.__accessBridgeLoaded = true;

  let currentExtractedText = "";
  let currentSummary = "";
  let currentIssues = [];

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "ACCESSBRIDGE_OPEN") {
      openPanel();
    }
  });

  // builds the panel(user interface)
  function openPanel() {
    removeExistingPanel();

    currentExtractedText = extractPageText();
    currentIssues = scanAccessibilityIssues();

    const panel = document.createElement("div");
    panel.id = "ab-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "AccessBridge accessibility assistant");

    panel.innerHTML = `
      <h2>AccessBridge</h2>
      <p class="ab-small">Digital accessibility support for difficult or inaccessible pages.</p>

      <div id="ab-status">
        Found <strong>${currentExtractedText.length}</strong> characters of readable page text.
      </div>

      <h3>Accessibility scan</h3>
      <div id="ab-issues">${renderIssues(currentIssues)}</div>

      <h3>Actions</h3>
      <button id="ab-summarize">Summarize page</button>
      <button id="ab-simplify">Simplify language</button>
      <button id="ab-read">Read aloud</button>
      <button id="ab-stop">Stop reading</button>
      <button id="ab-report">Generate barrier report</button>
      <button id="ab-copy">Copy output</button>
      <button id="ab-close">Close</button>

      <h3>Output</h3>
      <textarea id="ab-output" aria-label="AccessBridge output"></textarea>
    `;

    document.body.appendChild(panel);

    document.getElementById("ab-summarize").addEventListener("click", summarizePage);
    document.getElementById("ab-simplify").addEventListener("click", simplifyPage);
    document.getElementById("ab-read").addEventListener("click", readOutputAloud);
    document.getElementById("ab-stop").addEventListener("click", stopReading);
    document.getElementById("ab-report").addEventListener("click", generateBarrierReport);
    document.getElementById("ab-copy").addEventListener("click", copyOutput);
    document.getElementById("ab-close").addEventListener("click", removeExistingPanel);

    document.getElementById("ab-summarize").focus();
  }

  // closes the panel(duplication issue)
  function removeExistingPanel() {
    const existing = document.getElementById("ab-panel");
    if (existing) existing.remove();
  }

  // extracts readable content from the page (no screenshot idea)
  function extractPageText() {
    const main =
      document.querySelector("main") ||
      document.querySelector("article") ||
      document.querySelector("[role='main']") ||
      document.body;

    const clone = main.cloneNode(true);

    clone
      .querySelectorAll("script, style, noscript, nav, footer, header, form, button, svg")
      .forEach((el) => el.remove());

    const textElements = clone.querySelectorAll(
      "h1, h2, h3, h4, h5, h6, p, li, td, th, caption, blockquote"
    );

    const pieces = Array.from(textElements)
      .map((el) => el.innerText?.trim())
      .filter(Boolean)
      .filter((text) => text.length > 20);

    return pieces.join("\n\n").slice(0, 12000);
  }

  // runs the basic scan for red flags in accessibility 
  function scanAccessibilityIssues() {
    const issues = [];

    const images = Array.from(document.images);
    const imagesMissingAlt = images.filter((img) => !img.hasAttribute("alt"));

    if (imagesMissingAlt.length > 0) {
      issues.push({
        type: "Missing alt text",
        severity: "High",
        message: `${imagesMissingAlt.length} image(s) do not have alt text.`
      });
    }

    const paragraphs = Array.from(document.querySelectorAll("p"));
    const longParagraphs = paragraphs.filter((p) => p.innerText.length > 600);

    if (longParagraphs.length > 0) {
      issues.push({
        type: "Dense text",
        severity: "Medium",
        message: `${longParagraphs.length} paragraph(s) are very long and may be hard to read.`
      });
    }

    const h1Count = document.querySelectorAll("h1").length;
    const headingCount = document.querySelectorAll("h1, h2, h3, h4, h5, h6").length;

    if (headingCount === 0) {
      issues.push({
        type: "No headings",
        severity: "Medium",
        message: "This page has no visible heading structure."
      });
    }

    if (h1Count > 1) {
      issues.push({
        type: "Multiple main headings",
        severity: "Low",
        message: `This page has ${h1Count} H1 headings.`
      });
    }

    const videos = Array.from(document.querySelectorAll("video"));
    const videosWithoutTracks = videos.filter((video) => {
      return video.querySelectorAll("track[kind='captions'], track[kind='subtitles']").length === 0;
    });

    if (videosWithoutTracks.length > 0) {
      issues.push({
        type: "Possible missing captions",
        severity: "High",
        message: `${videosWithoutTracks.length} video(s) do not show caption or subtitle tracks in the markup.`
      });
    }

    if (currentExtractedText.length < 500) {
      issues.push({
        type: "Low readable text",
        severity: "Medium",
        message: "The page has very little readable text. It may rely on images, scanned content, or inaccessible widgets."
      });
    }

    return issues;
  }


  // converts it into a HTML so it can be displayed in the panel 
  function renderIssues(issues) {
    if (issues.length === 0) {
      return `<div class="ab-success">No obvious accessibility barriers found by the basic scan.</div>`;
    }

    return `
      <ul>
        ${issues
          .map(
            (issue) =>
              `<li><strong>${issue.severity}:</strong> ${issue.type} — ${issue.message}</li>`
          )
          .join("")}
      </ul>
    `;
  }

  // communicates with the back end for summarization
  async function summarizePage() {
    const output = document.getElementById("ab-output");
    output.value = "Summarizing page...";

    try {
      const result = await callSummarizer({
        mode: "summary",
        text: currentExtractedText,
        issues: currentIssues
      });

      currentSummary = result.summary;
      output.value = currentSummary;
    } catch (error) {
      output.value = "Could not summarize the page. Make sure the backend server is running on localhost:3000.";
      console.error(error);
    }
  }

  // same ordeal with summarize page just simple version 
  async function simplifyPage() {
    const output = document.getElementById("ab-output");
    output.value = "Simplifying language...";

    try {
      const result = await callSummarizer({
        mode: "simple",
        text: currentExtractedText,
        issues: currentIssues
      });

      currentSummary = result.summary;
      output.value = currentSummary;
    } catch (error) {
      output.value = "Could not simplify the page. Make sure the backend server is running on localhost:3000.";
      console.error(error);
    }
  }

  //issue with it crashing due to not being able to communicate with the local host so this function communicates with the background file 
  async function callSummarizer(payload) {
    const response = await chrome.runtime.sendMessage({
      type: "SUMMARIZE_TEXT",
      payload
    });

    if (!response || !response.ok) {
      throw new Error(response?.error || "Summarizer request failed");
    }

    return response.data;
  }

  // in its name uses the built in speech synthetics the browser has (no need for an API call)
  function readOutputAloud() {
    const output = document.getElementById("ab-output");
    const text = output.value || currentSummary || currentExtractedText.slice(0, 1000);

    if (!text.trim()) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    window.speechSynthesis.speak(utterance);
  }
  function stopReading() {
    window.speechSynthesis.cancel();
  }

  // creates A copyable accessibility barrier report for sending it to an department or web page designer for a report for it to be fix
  //(might get rid of it not sure yet)
  function generateBarrierReport() {
    const output = document.getElementById("ab-output");

    const issueText =
      currentIssues.length === 0
        ? "No obvious issues were detected by the basic scan."
        : currentIssues.map((i) => `- ${i.severity}: ${i.type} — ${i.message}`).join("\n");

    output.value = `Accessibility Barrier Report

Page title:
${document.title}

Page URL:
${location.href}

Possible barriers found:
${issueText}

Student impact:
This page may create access barriers for students who use screen readers, text-to-speech, captions, OCR tools, keyboard navigation, or simplified reading support.

Suggested next step:
Please review this page or material for accessibility and provide an accessible version if needed.

Generated by AccessBridge.`;
  }

  // copies the output into your clipboard (idea came from a friend)
  async function copyOutput() {
    const output = document.getElementById("ab-output");

    if (!output || !output.value.trim()) {
      output.value = "There is nothing to copy yet. Generate a summary or barrier report first.";
      return;
    }

    try {
      await navigator.clipboard.writeText(output.value);

      const originalText = output.value;

      output.value = "Copied to clipboard!\n\n" + originalText;
    } catch (error) {
      console.error("Copy failed:", error);
      output.select();
      document.execCommand("copy");
    }
  }
})();