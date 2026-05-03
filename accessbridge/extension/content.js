/**
 * this file runs inside the web page when the extension is active it takes care of: 
 * the panel 
 * extracts readable info
 * finds accessibility issues
 * sends text to the backend for the ai parts
 * low vision adjuster
 * ask about this page
 * and text to speech 
 */

(() => {
  if (window.__accessBridgeLoaded) {
    return;
  }

  window.__accessBridgeLoaded = true;

  let currentExtractedText = "";
  let currentSummary = "";
  let currentIssues = [];
  let currentBarrierMap = [];
  let currentPageSections = [];
  let pageMarkersVisible = false;
  let lastFocusedElement = null;
  let currentUtterance = null;
  let naturalVoiceAudio = null;
  let availableVoices = [];
  let speechHighlightRanges = [];
  let speechHighlightText = "";
  let speechHighlightClearTimer = null;
  let speechInlineWordSpans = [];
  let speechInlineActiveSpan = null;
  let autoMinimizeOnSpeechStart = false;
  let speechMiniRemoveTimer = null;
  let pendingSpeechText = "";
  let pendingSpeechSourceElements = [];
  let pendingSpeechSourceLabel = "page text";
  const STORAGE_KEY = "accessbridgePreferences";
  const LOW_VISION_STORAGE_KEY = "accessbridgeLowVisionSettings";
  const LOW_VISION_STATE_STORAGE_KEY = "accessbridgeLowVisionState";
  const LOW_VISION_DEFAULTS = Object.freeze({
    preset: "comfort",
    brightness: 88,
    contrast: 110,
    saturation: 92,
    warmth: 24,
    textScale: 112,
    lineHeight: 170,
    letterSpacing: 2,
    wordSpacing: 4,
    imageDim: 88,
    underlineLinks: true,
    boldText: false,
    reduceMotion: true
  });
  const LOW_VISION_PRESETS = Object.freeze({
    comfort: {
      preset: "comfort",
      brightness: 88,
      contrast: 108,
      saturation: 92,
      warmth: 26,
      textScale: 112,
      lineHeight: 170,
      letterSpacing: 2,
      wordSpacing: 4,
      imageDim: 90,
      underlineLinks: true,
      boldText: false,
      reduceMotion: true
    },
    dark: {
      preset: "dark",
      brightness: 78,
      contrast: 118,
      saturation: 85,
      warmth: 12,
      textScale: 115,
      lineHeight: 175,
      letterSpacing: 3,
      wordSpacing: 5,
      imageDim: 78,
      underlineLinks: true,
      boldText: false,
      reduceMotion: true
    },
    light: {
      preset: "light",
      brightness: 96,
      contrast: 105,
      saturation: 95,
      warmth: 14,
      textScale: 110,
      lineHeight: 165,
      letterSpacing: 1,
      wordSpacing: 3,
      imageDim: 94,
      underlineLinks: true,
      boldText: false,
      reduceMotion: false
    },
    "high-contrast": {
      preset: "high-contrast",
      brightness: 90,
      contrast: 138,
      saturation: 96,
      warmth: 6,
      textScale: 120,
      lineHeight: 180,
      letterSpacing: 4,
      wordSpacing: 6,
      imageDim: 88,
      underlineLinks: true,
      boldText: true,
      reduceMotion: true
    },
    amber: {
      preset: "amber",
      brightness: 76,
      contrast: 112,
      saturation: 82,
      warmth: 58,
      textScale: 114,
      lineHeight: 175,
      letterSpacing: 3,
      wordSpacing: 5,
      imageDim: 72,
      underlineLinks: true,
      boldText: false,
      reduceMotion: true
    },
    monochrome: {
      preset: "monochrome",
      brightness: 86,
      contrast: 132,
      saturation: 0,
      warmth: 0,
      textScale: 114,
      lineHeight: 172,
      letterSpacing: 2,
      wordSpacing: 4,
      imageDim: 86,
      underlineLinks: true,
      boldText: true,
      reduceMotion: true
    }
  });
  let lowVisionSettings = { ...LOW_VISION_DEFAULTS };
  let lowVisionActiveOnPage = false;
  let adaptationRequestId = 0;

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "ACCESSBRIDGE_OPEN") {
      openPanel();
    }

    if (message.type === "ACCESSBRIDGE_TOGGLE") {
      const existingPanel = document.getElementById("ab-panel");
      const existingReadingMode = document.getElementById("ab-reading-mode-overlay");

      if (existingPanel || existingReadingMode) {
        removeExistingPanel();
      } else {
        openPanel();
      }
    }
  });

  // builds the panel(user interface)
  function openPanel() {
    removeExistingPanel();

    lastFocusedElement = document.activeElement;
    currentExtractedText = extractPageText();
    setProgressState(2, "Step 2 of 4: checking barriers...");
    currentIssues = scanAccessibilityIssues();
    currentBarrierMap = buildBarrierMapEntries();
    currentPageSections = buildPageSections();

    const score = calculateAccessibilityScore(currentIssues);
    const scoreInfo = getScoreInfo(score);
    const issueCounts = getIssueCounts(currentIssues);
    const topConcern = getTopConcern(currentIssues);
    const recommendedNextStep = getRecommendedNextStep(currentIssues, currentExtractedText);

    const panel = document.createElement("div");
    panel.id = "ab-panel";
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "AccessBridge accessibility assistant. Press Alt plus X to reopen.");

    panel.innerHTML = `
      <header class="ab-minimal-header">
        <div class="ab-minimal-header-row">
          <h2>AccessBridge</h2>
          <button id="ab-panel-expand" class="ab-bar-expand" aria-label="Expand AccessBridge" type="button">⌄</button>
          <button id="ab-close" class="ab-minimal-close" aria-label="Close AccessBridge">×</button>
        </div>
        <div class="ab-title-line" aria-hidden="true"></div>
        <p class="ab-shortcut-line">Press <kbd>Alt</kbd> + <kbd>X</kbd> for quick access. Press it again to close.</p>
      </header>

      <div id="ab-live-status" class="ab-live-status" role="status" aria-live="polite">
        Panel opened. Choose how AccessBridge should help.
      </div>

      <section class="ab-start-box" aria-label="Student support modes">
        <p class="ab-start-question">Options:</p>

        <div class="ab-mode-grid" role="group" aria-label="Choose an accessibility support mode">
          <button id="ab-mode-reading" class="ab-mode-card" data-profile="reading" type="button" aria-pressed="false">
            Understand what's going on
          </button>

          <button class="ab-mode-card" data-profile="audio" type="button" aria-pressed="false">
            Text to speech
          </button>

          <button class="ab-mode-card" data-profile="focus" type="button" aria-pressed="false">
            Find what's important
          </button>

          <button class="ab-mode-card" data-profile="low-vision" type="button" aria-pressed="false">
            Low vision adjuster 
          </button>
        </div>

        <p id="ab-mode-description" class="ab-mode-description"><strong>What it does:</strong> summarize the page in plain student language.</p>

        <select id="ab-profile" class="ab-visually-hidden" aria-label="Current support mode">
          <option value="general">General Accessibility Rescue</option>
          <option value="reading" selected>Reading Support</option>
          <option value="audio">Audio / Screen Reader Support</option>
          <option value="focus">Focus Mode</option>
          <option value="low-vision">Low Vision Mode</option>
        </select>
        <button id="ab-apply-profile" class="ab-visually-hidden" type="button">Apply this mode now</button>

        <button id="ab-rescue" class="ab-main-action-button" type="button">
          Make this page easier to understand and read by summarizing
        </button>
        <p class="ab-main-action-description"><strong>What it does:</strong> Creates a quick student-friendly version, then improves it with AI when available.</p>
      </section>

      <div id="ab-progress-card" class="ab-progress-card" aria-live="polite" hidden>
        <span class="ab-card-kicker">Progress</span>
        <strong id="ab-progress-title">Ready when you are.</strong>
        <div class="ab-progress-track" aria-label="Adaptation progress">
          <span id="ab-progress-step-1" class="ab-progress-step">1 Scan</span>
          <span id="ab-progress-step-2" class="ab-progress-step">2 Local result</span>
          <span id="ab-progress-step-3" class="ab-progress-step">3 AI enrich</span>
          <span id="ab-progress-step-4" class="ab-progress-step">4 Ready</span>
        </div>
      </div>

      <section class="ab-section ab-result-section">
        <div class="ab-section-title-row">
          <h3>Result</h3>
          <button id="ab-copy" class="ab-small-button">Copy</button>
        </div>

        <div id="ab-result-card" class="ab-result-card" tabindex="-1">
          <strong id="ab-result-title">Ready to adapt this page</strong>
          <div id="ab-result-summary">Choose a support mode, then press Adapt this page for me. AccessBridge will create a quick local result first so the page is still useful if AI is slow or offline.</div>
          <div class="ab-result-audio-stack" aria-label="Result audio controls">
            <button id="ab-natural-voice" class="ab-small-button ab-button-success ab-result-play-button">Listen to result</button>
            <div class="ab-result-control-row">
              <button id="ab-pause" class="ab-small-button">Pause</button>
              <button id="ab-resume" class="ab-small-button">Resume</button>
              <button id="ab-stop" class="ab-small-button ab-danger-button">Stop</button>
            </div>
          </div>
        </div>
      </section>

      <details class="ab-product-drawer ab-page-nav-section ab-page-nav-drawer" id="ab-page-nav-drawer">
        <summary>Jump to a section</summary>
        <p class="ab-helper-text">Navigate by student destinations instead of technical issue names.</p>
        <div id="ab-page-navigator">${renderPageNavigator(currentPageSections)}</div>
      </details>

      <details class="ab-product-drawer">
        <summary>More tools</summary>
        <div class="ab-button-grid ab-quick-grid">
          <button id="ab-reading-mode" class="ab-button ab-button-success">
            <span class="ab-button-title">Reading view</span>
            <span class="ab-button-subtitle">Open a single-surface large-text reading mode</span>
          </button>

          <button id="ab-image" class="ab-button">
            <span class="ab-button-title">Screenshot / OCR</span>
            <span class="ab-button-subtitle">Explain visible text, images, charts, and layouts</span>
          </button>

          <button id="ab-highlight" class="ab-button" aria-pressed="false">
            <span class="ab-button-title">Show page markers</span>
            <span class="ab-button-subtitle">Highlight possible issues on the page until you click again</span>
          </button>
        </div>
      </details>

      <details class="ab-product-drawer">
        <summary>Ask about this page</summary>
        <p class="ab-helper-text">Ask a plain-language question. AccessBridge will look for the answer in the page text instead of guessing.</p>
        <div class="ab-question-grid">
          <input id="ab-question" class="ab-input" type="text" placeholder="Example: What forms do I need?" aria-label="Ask this page a question">
          <button id="ab-ask" class="ab-small-full-button">Ask</button>
        </div>
        <div class="ab-chip-row" aria-label="Example questions">
          <button class="ab-chip" data-question="What do I need to do?">What do I need to do?</button>
          <button class="ab-chip" data-question="What is due?">What is due?</button>
          <button class="ab-chip" data-question="What forms do I need?">Forms?</button>
          <button class="ab-chip" data-question="Who do I contact?">Who do I contact?</button>
          <button class="ab-chip" data-question="Explain this simply.">Explain simply</button>
        </div>
      </details>

      <details class="ab-product-drawer">
        <summary>Need to report a problem?</summary>
        <label class="ab-field-label" for="ab-report-type">Report type</label>
        <select id="ab-report-type" class="ab-select">
          <option value="student">Student version</option>
          <option value="professor">Professor version</option>
          <option value="sas-it">SAS / IT version</option>
          <option value="technical">Technical version</option>
          <option value="facilities">Facilities / campus access version</option>
        </select>
        <div class="ab-inline-actions">
          <button id="ab-report" class="ab-small-button">Generate report</button>
          <button id="ab-copy-professor" class="ab-small-button">Copy professor email</button>
          <button id="ab-copy-sas" class="ab-small-button">Copy SAS/IT draft</button>
          <button id="ab-export-json" class="ab-small-button">Export JSON</button>
        </div>
      </details>

      <details class="ab-product-drawer ab-technical-drawer">
        <summary>Technical status</summary>
        <div class="ab-backend-card" id="ab-backend-card">
          <span class="ab-card-kicker">System status</span>
          <div class="ab-backend-row"><strong>Backend:</strong> <span id="ab-backend-status">Checking...</span></div>
          <div class="ab-backend-row"><strong>AI:</strong> <span id="ab-ai-status">Checking...</span></div>
          <div class="ab-backend-row"><strong>Model:</strong> <span id="ab-model-status">Checking...</span></div>
          <div class="ab-backend-row"><strong>Local fallback:</strong> <span>Available ✓</span></div>
        </div>

        <details class="ab-nested-disclosure">
          <summary>Audio settings</summary>
          <label class="ab-field-label" for="ab-voice">Voice</label>
          <select id="ab-voice" class="ab-select">
            <option value="">Default voice</option>
          </select>
          <div class="ab-slider-grid">
            <label>Speed <input id="ab-rate" type="range" min="0.6" max="1.6" step="0.1" value="0.9"><span id="ab-rate-value">0.9x</span></label>
            <label>Pitch <input id="ab-pitch" type="range" min="0.5" max="1.5" step="0.1" value="1"><span id="ab-pitch-value">1.0</span></label>
            <label>Volume <input id="ab-volume" type="range" min="0" max="1" step="0.1" value="1"><span id="ab-volume-value">100%</span></label>
          </div>
        </details>

        <details class="ab-nested-disclosure">
          <summary>Raw output</summary>
          <textarea 
            id="ab-output" 
            aria-label="AccessBridge raw output"
            placeholder="Raw text output appears here for copying, reports, or debugging."
          ></textarea>
        </details>
      </details>

      <div class="ab-privacy-note">
        AccessBridge adapts only when you open it. Screenshot/OCR sends an image only when you choose that tool.
      </div>
    `;

    document.body.appendChild(panel);

    panel.addEventListener("pointerdown", (event) => {
      // opens the little accessbridge bar back into the full panel
      if (panel.classList.contains("ab-panel-minimized")) {
        event.stopPropagation();
        expandPanelFromBar();
        return;
      }

      if (!panel.classList.contains("ab-panel-page-preview")) return;

      // if the panel is in preview mode clicking it makes it normal again
      if (!event.target.closest(".ab-mode-card")) {
        exitPanelPagePreview();
      }
    });

    panel.addEventListener("focusin", (event) => {
      if (!panel.classList.contains("ab-panel-page-preview")) return;

      // same idea for keyboard users so tabbing back opens it too
      if (!event.target.closest(".ab-mode-card")) {
        exitPanelPagePreview();
      }
    });

    document.getElementById("ab-rescue").addEventListener("click", () => summarizePage({ buttonId: "ab-rescue", loadingTitle: "Making page easier to understand...", resultTitle: "Page summary" }));
    document.getElementById("ab-reading-mode").addEventListener("click", openReadingMode);
    document.getElementById("ab-image").addEventListener("click", analyzeVisibleScreenshot);
    document.getElementById("ab-highlight").addEventListener("click", togglePageMarkers);
    document.getElementById("ab-read")?.addEventListener("click", readOutputAloud);
    document.getElementById("ab-natural-voice")?.addEventListener("click", readOutputWithNaturalVoice);
    document.getElementById("ab-pause").addEventListener("click", pauseReading);
    document.getElementById("ab-resume").addEventListener("click", resumeReading);
    document.getElementById("ab-stop").addEventListener("click", stopReading);
    document.getElementById("ab-report").addEventListener("click", generateBarrierReport);
    document.getElementById("ab-export-json").addEventListener("click", exportReportJson);
    document.getElementById("ab-copy").addEventListener("click", copyOutput);
    document.getElementById("ab-copy-professor").addEventListener("click", () => copyReportType("professor"));
    document.getElementById("ab-copy-sas").addEventListener("click", () => copyReportType("sas-it"));
    document.getElementById("ab-ask").addEventListener("click", askPageQuestion);
    document.getElementById("ab-apply-profile").addEventListener("click", applyStudentPreset);

    document.querySelectorAll(".ab-mode-card").forEach((button) => {
      button.addEventListener("click", () => selectStudentMode(button.dataset.profile));
    });

    document.querySelectorAll(".ab-section-jump").forEach((button) => {
      button.addEventListener("click", () => jumpToPageSection(button.dataset.sectionId));
    });

    document.querySelectorAll(".ab-section-read").forEach((button) => {
      button.addEventListener("click", () => readPageSection(button.dataset.sectionId));
    });

    document.querySelectorAll(".ab-section-simplify").forEach((button) => {
      button.addEventListener("click", () => simplifyPageSection(button.dataset.sectionId));
    });

    document.getElementById("ab-test-voice")?.addEventListener("click", testVoice);
    document.getElementById("ab-panel-expand").addEventListener("click", (event) => {
      event.stopPropagation();
      expandPanelFromBar();
    });
    document.getElementById("ab-close").addEventListener("click", removeExistingPanel);

    document.querySelectorAll(".ab-barrier-jump").forEach((button) => {
      button.addEventListener("click", () => jumpToBarrier(button.dataset.barrierId));
    });

    document.querySelectorAll(".ab-chip").forEach((button) => {
      button.addEventListener("click", () => {
        const question = document.getElementById("ab-question");
        question.value = button.dataset.question || "";
        askPageQuestion();
      });
    });

    document.querySelectorAll("#ab-rate, #ab-pitch, #ab-volume").forEach((slider) => {
      slider.addEventListener("input", () => {
        updateSliderLabels();
        savePreferences();
      });
    });

    document.getElementById("ab-voice")?.addEventListener("change", savePreferences);

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", minimizePanelOnPagePointerDown, true);

    populateVoices();
    updateSliderLabels();
    checkBackendStatus();
    loadPreferences();
    restoreLowVisionFromStorage();

    document.getElementById("ab-rescue").focus();
  }

  // closes the panel(duplication issue)
  function removeExistingPanel() {
    const existing = document.getElementById("ab-panel");
    if (existing) existing.remove();

    const readingMode = document.getElementById("ab-reading-mode-overlay");
    if (readingMode) readingMode.remove();

    if (window.speechSynthesis?.speaking || window.speechSynthesis?.pending) {
      window.speechSynthesis.cancel();
    }

    clearSpeechHighlight(true);
    hideSpeechMiniControls(true);
    if (lowVisionActiveOnPage) {
      saveLowVisionSnapshot(true);
      removeLowVisionAdjuster({ keepHalfDock: false });
    } else {
      removeLowVisionAdjuster({ keepHalfDock: false });
      clearLowVisionVisualState({ saveState: false });
    }
    clearHighlights();

    document.removeEventListener("keydown", closeOnEscape);
    document.removeEventListener("pointerdown", minimizePanelOnPagePointerDown, true);

    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      try {
        lastFocusedElement.focus();
      } catch (error) {
        console.error("Could not restore focus:", error);
      }
    }
  }

  function clearSpeechInteractionForModeSwitch() {
    stopNaturalVoiceAudio(false);

    if (currentUtterance) {
      currentUtterance.onstart = null;
      currentUtterance.onboundary = null;
      currentUtterance.onpause = null;
      currentUtterance.onresume = null;
      currentUtterance.onend = null;
      currentUtterance.onerror = null;
    }

    if (window.speechSynthesis?.speaking || window.speechSynthesis?.pending || window.speechSynthesis?.paused) {
      window.speechSynthesis.cancel();
    }

    currentUtterance = null;
    autoMinimizeOnSpeechStart = false;
    pendingSpeechText = "";
    pendingSpeechSourceElements = [];
    pendingSpeechSourceLabel = "page text";

    clearSpeechHighlight(true);
    hideSpeechMiniControls(true);

    document.querySelectorAll(".ab-audio-support-target-active").forEach((element) => {
      element.classList.remove("ab-audio-support-target-active");
      element.setAttribute("aria-pressed", "false");
    });

    setSpeechStatus("Ready", "Choose Text to speech to listen to page sections.", "idle");
  }

  function closeOnEscape(event) {
    if (event.key !== "Escape") return;

    // escape closes reading mode first so it does not close everything at once
    if (document.getElementById("ab-reading-mode-overlay")) return;

    removeExistingPanel();
  }

  function minimizePanelOnPagePointerDown(event) {
    const panel = document.getElementById("ab-panel");
    if (!panel) return;

    // reading mode is its own full screen thing so the hidden panel stays hidden
    if (document.getElementById("ab-reading-mode-overlay")) return;

    const adjuster = document.getElementById("ab-low-vision-adjuster");
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const clickedInsidePanel = path.includes(panel) || panel.contains(event.target);
    const clickedInsideAdjuster = adjuster && (path.includes(adjuster) || adjuster.contains(event.target));

    if (clickedInsidePanel || clickedInsideAdjuster) return;

    // clicking the page shrinks accessbridge into a bar
    // display and tone gets its own little bar so the settings keep working
    if (adjuster && !adjuster.hidden && !adjuster.classList.contains("ab-low-vision-adjuster-minimized")) {
      minimizeLowVisionAdjusterToBar();
    }

    minimizePanelToBar();
  }

  function minimizePanelToBar() {
    const panel = document.getElementById("ab-panel");
    if (!panel || panel.classList.contains("ab-panel-minimized")) return;

    panel.classList.add("ab-panel-minimized");
    panel.classList.remove("ab-panel-half-minimized");
    panel.classList.remove("ab-panel-page-preview");
    panel.setAttribute(
      "aria-label",
      "AccessBridge is minimized. Click the AccessBridge bar to expand controls."
    );

    const liveStatus = document.getElementById("ab-live-status");
    if (liveStatus) liveStatus.textContent = "AccessBridge minimized. Click the AccessBridge bar to expand.";
  }

  function expandPanelFromBar() {
    const panel = document.getElementById("ab-panel");
    if (!panel) return;

    // when the main panel opens again keep display and tone minimized instead of deleting it
    const adjuster = document.getElementById("ab-low-vision-adjuster");
    if (adjuster && !adjuster.hidden && !adjuster.classList.contains("ab-low-vision-adjuster-minimized")) {
      minimizeLowVisionAdjusterToBar();
    } else if (adjuster && !adjuster.hidden) {
      saveLowVisionSnapshot(true);
    }

    panel.classList.remove("ab-panel-minimized");
    panel.classList.remove("ab-panel-half-minimized");
    panel.classList.remove("ab-panel-page-preview");
    panel.setAttribute(
      "aria-label",
      "AccessBridge accessibility assistant. Press Alt plus X to reopen."
    );

    const liveStatus = document.getElementById("ab-live-status");
    if (liveStatus) liveStatus.textContent = "AccessBridge expanded. Display and tone remains minimized if it is active.";
  }

  function trapPanelKeyboard(event) {
    if (event.key !== "Tab") return;

    const panel = document.getElementById("ab-panel");
    if (!panel) return;

    const focusable = Array.from(
      panel.querySelectorAll("button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])")
    ).filter((element) => !element.disabled && element.offsetParent !== null);

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
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
      .querySelectorAll("script, style, noscript, nav, footer, header, form, button, svg, #ab-panel, #ab-reading-mode-overlay, .ab-highlight-label")
      .forEach((el) => el.remove());

    const textElements = clone.querySelectorAll(
      "h1, h2, h3, h4, h5, h6, p, li, td, th, caption, blockquote, label"
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

    addIssue(issues, "Missing alt text", "High", findImagesMissingAlt(), "image(s) do not have alt text.");
    addIssue(issues, "Empty alt text", "Medium", findImagesEmptyAlt(), "image(s) have empty alt text. This can be okay for decorative images, but important images may need descriptions.");
    addIssue(issues, "Suspicious image filenames", "Low", findSuspiciousImageFilenames(), "image(s) use generic filenames like image, screenshot, chart, or diagram. They may need meaningful descriptions.");
    addIssue(issues, "SVGs without labels", "Medium", findUnlabeledSvgs(), "SVG graphic(s) may be missing accessible labels.");
    addIssue(issues, "Canvas without fallback text", "High", findCanvasWithoutFallback(), "canvas element(s) may not provide a text alternative.");
    addIssue(issues, "Possible chart or diagram images", "Medium", findPossibleChartImages(), "image(s) may contain charts, maps, diagrams, or visual information that needs explanation.");
    addIssue(issues, "Dense text", "Medium", findLongParagraphs(), "paragraph(s) are very long and may be hard to read.");

    const h1Count = document.querySelectorAll("h1").length;
    const headingCount = document.querySelectorAll("h1, h2, h3, h4, h5, h6").length;

    if (headingCount === 0) {
      issues.push({ type: "No headings", severity: "Medium", message: "This page has no visible heading structure.", count: 1 });
    }

    if (h1Count > 1) {
      issues.push({ type: "Multiple main headings", severity: "Low", message: `This page has ${h1Count} H1 headings.`, count: h1Count });
    }

    addIssue(issues, "Heading order issue", "Medium", findHeadingOrderIssues(), "heading(s) appear to skip levels, which may make the page harder to navigate with assistive technology.");
    addIssue(issues, "Unlabeled form fields", "High", findUnlabeledInputs(), "form field(s) may be missing accessible labels.");
    addIssue(issues, "Placeholder-only labels", "Medium", findPlaceholderOnlyInputs(), "form field(s) appear to use placeholders instead of visible or accessible labels.");
    addIssue(issues, "Required fields not clearly marked", "Medium", findUnclearRequiredFields(), "required field(s) may not clearly explain that they are required.");
    addIssue(issues, "Small form controls", "Low", findSmallInteractiveElements(), "interactive control(s) may be small or hard to target.");
    addIssue(issues, "Vague link text", "Medium", findVagueLinks(), "link(s) use vague text like “click here” or “read more.”");
    addIssue(issues, "Empty links", "High", findEmptyLinks(), "link(s) may not have readable or accessible names.");
    addIssue(issues, "Repeated links with different destinations", "Low", findRepeatedLinksDifferentDestinations(), "repeated link text appears to go to different destinations.");
    addIssue(issues, "Unnamed buttons", "High", findUnnamedButtons(), "button(s) may not have accessible names.");
    addIssue(issues, "Possible missing captions", "High", findVideosWithoutCaptions(), "video(s) do not show caption or subtitle tracks in the markup.");
    addIssue(issues, "Audio without transcript link", "Medium", findAudioWithoutTranscript(), "audio element(s) may need a transcript nearby.");
    addIssue(issues, "Autoplaying media", "Medium", findAutoplayingMedia(), "media element(s) may autoplay, which can be distracting or difficult for some students.");
    addIssue(issues, "Iframes without titles", "Medium", findIframesWithoutTitles(), "embedded frame(s) may be missing title attributes.");
    addIssue(issues, "Tables without captions", "Low", findTablesWithoutCaptions(), "table(s) do not have captions.");
    addIssue(issues, "Tables without headers", "Medium", findTablesWithoutHeaders(), "table(s) may be missing header cells.");
    addIssue(issues, "Positive tabindex", "Low", findPositiveTabindexElements(), "element(s) use positive tabindex, which can create confusing keyboard order.");

    const interactiveCount = document.querySelectorAll("a, button, input, textarea, select, [tabindex], [role='button'], [role='link']").length;
    if (interactiveCount > 40) {
      issues.push({
        type: "Many interactive elements",
        severity: "Low",
        message: `This page has ${interactiveCount} interactive elements. Students using keyboard navigation may need clear focus order and visible focus styles.`,
        count: interactiveCount
      });
    }

    if (currentExtractedText.length < 500) {
      issues.push({
        type: "Low readable text",
        severity: "Medium",
        message: "The page has very little readable text. It may rely on images, scanned content, or inaccessible widgets.",
        count: 1
      });
    }

    return issues;
  }

  function addIssue(issues, type, severity, elements, messageTail) {
    if (elements.length > 0) {
      issues.push({
        type,
        severity,
        message: `${elements.length} ${messageTail}`,
        count: elements.length
      });
    }
  }

  function findImagesMissingAlt() {
    return Array.from(document.images).filter((img) => !img.hasAttribute("alt"));
  }

  function findImagesEmptyAlt() {
    return Array.from(document.images).filter((img) => img.hasAttribute("alt") && img.getAttribute("alt").trim() === "");
  }

  function findSuspiciousImageFilenames() {
    const suspicious = /(image|img|screenshot|screen-shot|diagram|chart|graph|map|figure|scan|flyer)\d*\.(png|jpg|jpeg|gif|webp|svg)/i;
    return Array.from(document.images).filter((img) => suspicious.test(img.currentSrc || img.src || ""));
  }

  function findUnlabeledSvgs() {
    return Array.from(document.querySelectorAll("svg")).filter((svg) => {
      return !svg.getAttribute("aria-label") && !svg.getAttribute("aria-labelledby") && !svg.querySelector("title");
    });
  }

  function findPossibleChartImages() {
    return Array.from(document.images).filter((img) => {
      const context = `${img.alt || ""} ${img.src || ""} ${img.parentElement?.innerText || ""}`.toLowerCase();
      return /(chart|graph|diagram|map|figure|table|schedule|flyer|poster)/.test(context);
    });
  }

  function findLongParagraphs() {
    return Array.from(document.querySelectorAll("p")).filter((p) => p.innerText && p.innerText.length > 600);
  }

  function findUnlabeledInputs() {
    return Array.from(document.querySelectorAll("input, textarea, select")).filter((el) => {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type)) return false;

      const hasAria = el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby");
      const id = el.id;
      const hasLabel = id && document.querySelector(`label[for="${escapeSelector(id)}"]`);
      const wrappedByLabel = el.closest("label");
      const hasTitle = el.getAttribute("title")?.trim();

      return !hasAria && !hasLabel && !wrappedByLabel && !hasTitle;
    });
  }

  function findPlaceholderOnlyInputs() {
    return Array.from(document.querySelectorAll("input, textarea")).filter((el) => {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (["hidden", "submit", "button", "reset"].includes(type)) return false;
      const hasPlaceholder = Boolean(el.getAttribute("placeholder")?.trim());
      const unlabeled = findUnlabeledInputs().includes(el);
      return hasPlaceholder && unlabeled;
    });
  }

  function findUnclearRequiredFields() {
    return Array.from(document.querySelectorAll("input[required], textarea[required], select[required]")).filter((el) => {
      const labelText = getElementLabelText(el).toLowerCase();
      return !labelText.includes("required") && !labelText.includes("*") && !el.getAttribute("aria-required");
    });
  }

  function findSmallInteractiveElements() {
    return Array.from(document.querySelectorAll("button, a, input, select, textarea, [role='button']")).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.width < 32 || rect.height < 32);
    });
  }

  function findVagueLinks() {
    const vague = ["click here", "here", "read more", "learn more", "more", "link", "details"];

    return Array.from(document.querySelectorAll("a")).filter((a) => {
      const text = (a.innerText || a.getAttribute("aria-label") || "").trim().toLowerCase();
      return vague.includes(text);
    });
  }

  function findEmptyLinks() {
    return Array.from(document.querySelectorAll("a")).filter((a) => {
      const name = a.innerText?.trim() || a.getAttribute("aria-label") || a.getAttribute("title");
      return !name;
    });
  }

  function findRepeatedLinksDifferentDestinations() {
    const links = Array.from(document.querySelectorAll("a"));
    const seen = new Map();
    const problems = [];

    links.forEach((link) => {
      const text = (link.innerText || link.getAttribute("aria-label") || "").trim().toLowerCase();
      const href = link.href || "";
      if (!text || !href) return;

      if (!seen.has(text)) {
        seen.set(text, href);
      } else if (seen.get(text) !== href) {
        problems.push(link);
      }
    });

    return problems;
  }

  function findHeadingOrderIssues() {
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"));
    const problems = [];
    let previousLevel = 0;

    headings.forEach((heading) => {
      const level = Number(heading.tagName.substring(1));

      if (previousLevel && level > previousLevel + 1) {
        problems.push(heading);
      }

      previousLevel = level;
    });

    return problems;
  }

  function findUnnamedButtons() {
    return Array.from(document.querySelectorAll("button, [role='button']")).filter((button) => {
      if (button.closest("#ab-panel") || button.closest("#ab-reading-mode-overlay")) return false;

      const name =
        button.innerText?.trim() ||
        button.getAttribute("aria-label") ||
        button.getAttribute("aria-labelledby") ||
        button.getAttribute("title");

      return !name;
    });
  }

  function findVideosWithoutCaptions() {
    return Array.from(document.querySelectorAll("video")).filter((video) => {
      return video.querySelectorAll("track[kind='captions'], track[kind='subtitles']").length === 0;
    });
  }

  function findAudioWithoutTranscript() {
    return Array.from(document.querySelectorAll("audio")).filter((audio) => {
      const nearbyText = audio.parentElement?.innerText?.toLowerCase() || "";
      return !nearbyText.includes("transcript");
    });
  }

  function findAutoplayingMedia() {
    return Array.from(document.querySelectorAll("video[autoplay], audio[autoplay]")).filter(Boolean);
  }

  function findIframesWithoutTitles() {
    return Array.from(document.querySelectorAll("iframe")).filter((iframe) => {
      return !iframe.getAttribute("title")?.trim();
    });
  }

  function findTablesWithoutCaptions() {
    return Array.from(document.querySelectorAll("table")).filter((table) => {
      return !table.querySelector("caption");
    });
  }

  function findTablesWithoutHeaders() {
    return Array.from(document.querySelectorAll("table")).filter((table) => {
      return !table.querySelector("th");
    });
  }

  function findCanvasWithoutFallback() {
    return Array.from(document.querySelectorAll("canvas")).filter((canvas) => {
      const hasText = canvas.textContent?.trim();
      const hasName = canvas.getAttribute("aria-label") || canvas.getAttribute("title");
      return !hasText && !hasName;
    });
  }

  function findPositiveTabindexElements() {
    return Array.from(document.querySelectorAll("[tabindex]")).filter((element) => {
      if (element.closest("#ab-panel") || element.closest("#ab-reading-mode-overlay")) return false;
      return Number(element.getAttribute("tabindex")) > 0;
    });
  }

  function getElementLabelText(el) {
    const id = el.id;
    const label = id ? document.querySelector(`label[for="${escapeSelector(id)}"]`) : null;
    return `${label?.innerText || ""} ${el.closest("label")?.innerText || ""} ${el.getAttribute("aria-label") || ""}`;
  }

  function escapeSelector(value) {
    if (window.CSS && CSS.escape) {
      return CSS.escape(value);
    }

    return String(value).replace(/"/g, '\\"');
  }

  function buildBarrierMapEntries() {
    const entries = [];
    let index = 1;

    const groups = [
      { type: "Missing alt text", severity: "High", elements: findImagesMissingAlt(), label: "Image missing alt text", fix: "Add useful alt text that explains the image meaning." },
      { type: "Empty alt text", severity: "Medium", elements: findImagesEmptyAlt(), label: "Image has empty alt text", fix: "If meaningful, add an image description. If decorative, empty alt may be okay." },
      { type: "Dense text", severity: "Medium", elements: findLongParagraphs(), label: "Dense paragraph", fix: "Break this into shorter paragraphs, bullets, or steps." },
      { type: "Heading order issue", severity: "Medium", elements: findHeadingOrderIssues(), label: "Heading order jump", fix: "Use headings in order, such as H2 before H3 before H4." },
      { type: "Unlabeled form fields", severity: "High", elements: findUnlabeledInputs(), label: "Unlabeled form field", fix: "Connect the field to a visible label, aria-label, or aria-labelledby." },
      { type: "Vague link text", severity: "Medium", elements: findVagueLinks(), label: "Vague link text", fix: "Replace vague text with a specific destination or action." },
      { type: "Unnamed buttons", severity: "High", elements: findUnnamedButtons(), label: "Unnamed button", fix: "Add visible text, aria-label, or title so the button has a clear name." },
      { type: "Possible missing captions", severity: "High", elements: findVideosWithoutCaptions(), label: "Video may need captions", fix: "Add caption/subtitle tracks or provide a transcript." },
      { type: "Iframes without titles", severity: "Medium", elements: findIframesWithoutTitles(), label: "Iframe missing title", fix: "Add a title that explains the embedded content." },
      { type: "Tables without headers", severity: "Medium", elements: findTablesWithoutHeaders(), label: "Table may need headers", fix: "Use th elements and a clear table structure." },
      { type: "Canvas without fallback text", severity: "High", elements: findCanvasWithoutFallback(), label: "Canvas needs fallback text", fix: "Provide a text alternative for the canvas content." }
    ];

    groups.forEach((group) => {
      group.elements.slice(0, 6).forEach((element) => {
        const id = `ab-barrier-${index}`;
        element.dataset.abBarrierId = id;
        entries.push({
          id,
          index,
          type: group.type,
          severity: group.severity,
          label: group.label,
          fix: group.fix,
          element,
          location: getElementLocation(element)
        });
        index++;
      });
    });

    return entries.slice(0, 20);
  }

  function getElementLocation(element) {
    const heading = element.closest("section, article, main, div")?.querySelector("h1,h2,h3,h4,h5,h6")?.innerText?.trim();
    if (heading) return `Near “${heading.slice(0, 60)}”`;

    const text = element.innerText || element.alt || element.getAttribute("aria-label") || element.getAttribute("placeholder") || element.tagName.toLowerCase();
    return text ? `Near “${String(text).trim().slice(0, 60)}”` : element.tagName.toLowerCase();
  }

  // converts it into a HTML so it can be displayed in the panel 
  function renderTopIssueSummary(issues) {
    if (!issues || issues.length === 0) {
      return `<div class="ab-empty-state"><strong>No major barriers found.</strong><span>AccessBridge can still summarize, simplify, and read the page aloud.</span></div>`;
    }

    return `
      <ol class="ab-top-issue-list">
        ${issues.slice(0, 3).map((issue) => `
          <li>
            <strong>${escapeHTML(issue.type)}</strong>
            <span>${escapeHTML(getWhyThisMatters(issue.type))}</span>
          </li>
        `).join("")}
      </ol>
    `;
  }

  function refreshTopIssues() {
    const topIssues = document.querySelector(".ab-top-issues-card");
    if (topIssues) topIssues.innerHTML = renderTopIssueSummary(currentIssues);

    const fullIssues = document.getElementById("ab-issues");
    if (fullIssues) fullIssues.innerHTML = renderIssues(currentIssues);

    const barrierMap = document.getElementById("ab-barrier-map");
    if (barrierMap) barrierMap.innerHTML = renderBarrierMap(currentBarrierMap);
  }

  function refreshPageNavigator() {
    const navigator = document.getElementById("ab-page-navigator");
    if (!navigator) return;

    navigator.innerHTML = renderPageNavigator(currentPageSections);
    navigator.querySelectorAll(".ab-section-jump").forEach((button) => {
      button.addEventListener("click", () => jumpToPageSection(button.dataset.sectionId));
    });
    navigator.querySelectorAll(".ab-section-read").forEach((button) => {
      button.addEventListener("click", () => readPageSection(button.dataset.sectionId));
    });
    navigator.querySelectorAll(".ab-section-simplify").forEach((button) => {
      button.addEventListener("click", () => simplifyPageSection(button.dataset.sectionId));
    });
  }

  function renderIssues(issues) {
    if (issues.length === 0) {
      return `
        <div class="ab-empty-state">
          <strong>No obvious barriers found.</strong>
          <span>The scan did not find missing alt text, missing headings, dense paragraphs, unlabeled form fields, vague links, or videos without caption tracks.</span>
        </div>
      `;
    }

    return `
      <div class="ab-issue-list">
        ${issues
          .map((issue) => {
            const severityClass = getSeverityClass(issue.severity);

            return `
              <div class="ab-issue-card ${severityClass}">
                <div class="ab-issue-topline">
                  <span class="ab-issue-severity">${escapeHTML(issue.severity)}</span>
                  <span class="ab-issue-type">${escapeHTML(issue.type)}</span>
                </div>
                <div class="ab-issue-message">${escapeHTML(issue.message)}</div>
                <div class="ab-issue-impact"><strong>Why this matters:</strong> ${escapeHTML(getWhyThisMatters(issue.type))}</div>
                <div class="ab-issue-fix"><strong>Possible fix:</strong> ${escapeHTML(getSuggestedFix(issue.type))}</div>
              </div>
            `;
          })
          .join("\n")}
      </div>
    `;
  }

  function renderBarrierMap(entries) {
    if (entries.length === 0) {
      return `
        <div class="ab-empty-state">
          <strong>No jumpable barriers found.</strong>
          <span>The scan did not find issues that can be highlighted on this page.</span>
        </div>
      `;
    }

    return `
      <div class="ab-barrier-map-list">
        ${entries
          .map((entry) => `
            <div class="ab-barrier-map-item">
              <div>
                <strong>${entry.index}. ${escapeHTML(entry.label)}</strong>
                <span>${escapeHTML(entry.location)}</span>
                <small>${escapeHTML(entry.fix)}</small>
              </div>
              <button class="ab-barrier-jump" data-barrier-id="${escapeHTML(entry.id)}">Jump</button>
            </div>
          `)
          .join("\n")}
      </div>
    `;
  }


  function buildPageSections() {
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
      .filter((heading) => !heading.closest("#ab-panel") && !heading.closest("#ab-reading-mode-overlay"));

    if (headings.length === 0) {
      const main = document.querySelector("main") || document.querySelector("article") || document.querySelector("[role='main']") || document.body;
      return [createPageSection("ab-section-main", document.title || "Main page content", main, currentExtractedText, currentBarrierMap.length)];
    }

    return headings.slice(0, 10).map((heading, index) => {
      const nextHeading = headings[index + 1] || null;
      const id = `ab-page-section-${index + 1}`;
      heading.dataset.abPageSectionId = id;

      const text = collectSectionText(heading, nextHeading);
      const issueCount = currentBarrierMap.filter((entry) => isElementInsideSection(entry.element, heading, nextHeading)).length;

      return createPageSection(id, heading.innerText?.trim() || `Section ${index + 1}`, heading, text, issueCount);
    });
  }

  function createPageSection(id, title, element, text, issueCount) {
    const cleanTitle = String(title || "Untitled section").replace(/\s+/g, " ").trim().slice(0, 80);

    return {
      id,
      title: cleanTitle || "Untitled section",
      element,
      text: String(text || "").trim().slice(0, 4500),
      issueCount: Number(issueCount || 0)
    };
  }

  function collectSectionText(startHeading, nextHeading) {
    const pieces = [startHeading.innerText?.trim()].filter(Boolean);
    let node = startHeading.nextElementSibling;

    while (node && node !== nextHeading && pieces.join(" ").length < 4500) {
      if (node.matches?.("h1,h2,h3,h4,h5,h6")) break;
      if (!node.closest?.("#ab-panel") && !node.closest?.("#ab-reading-mode-overlay")) {
        const text = node.innerText?.trim();
        if (text) pieces.push(text);
      }
      node = node.nextElementSibling;
    }

    return pieces.join("\n\n");
  }

  function isElementInsideSection(element, startHeading, nextHeading) {
    if (!element || !startHeading) return false;
    if (element === startHeading || startHeading.contains(element)) return true;

    const afterStart = Boolean(startHeading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
    const beforeNext = !nextHeading || Boolean(nextHeading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING);

    return afterStart && beforeNext;
  }

  function renderPageNavigator(sections) {
    if (!sections || sections.length === 0) {
      return `
        <div class="ab-empty-state">
          <strong>No page sections found.</strong>
          <span>AccessBridge could not identify clear headings, so use Adapt this page for me first.</span>
        </div>
      `;
    }

    return `
      <div class="ab-page-section-list">
        ${sections
          .map((section, index) => `
            <article class="ab-page-section-card">
              <div class="ab-page-section-main">
                <span class="ab-section-number">${index + 1}</span>
                <div>
                  <strong>${escapeHTML(section.title)}</strong>
                  <span>${section.issueCount > 0 ? `${section.issueCount} possible barrier${section.issueCount === 1 ? "" : "s"} nearby` : "No nearby barriers found"}</span>
                </div>
              </div>
              <div class="ab-page-section-actions">
                <button class="ab-small-button ab-section-jump" data-section-id="${escapeHTML(section.id)}">Jump</button>
                <button class="ab-small-button ab-section-read" data-section-id="${escapeHTML(section.id)}">Read</button>
              </div>
            </article>
          `)
          .join("\n")}
      </div>
    `;
  }

  function getPageSectionById(id) {
    return currentPageSections.find((section) => section.id === id);
  }

  function jumpToPageSection(id) {
    const section = getPageSectionById(id);
    if (!section || !section.element) return;

    section.element.scrollIntoView({ behavior: "smooth", block: "center" });
    section.element.classList.add("ab-section-jump-highlight");
    window.setTimeout(() => section.element.classList.remove("ab-section-jump-highlight"), 2200);

    if (typeof section.element.focus === "function") {
      section.element.setAttribute("tabindex", section.element.getAttribute("tabindex") || "-1");
      section.element.focus({ preventScroll: true });
    }

    setOutputValue(`Section selected:\n${section.title}\n\n${section.text || "No readable text was found in this section."}`, "Page section");
    setLiveStatus(`Jumped to ${section.title}.`);
  }

  function readPageSection(id) {
    const section = getPageSectionById(id);
    if (!section) return;

    const text = section.text || section.title;
    setOutputValue(`Reading section:\n${section.title}\n\n${text}`, `Reading: ${section.title}`);
    speakText(text, `section: ${section.title}`, section.element);
  }

  async function simplifyPageSection(id) {
    const section = getPageSectionById(id);
    if (!section) return;

    const stopLoading = setButtonLoading("ab-rescue", "Simplifying section...");
    setOutputValue(`Simplifying section:\n${section.title}\n\nPlease wait...`, `Simplifying: ${section.title}`);

    try {
      const result = await callSummarizer({
        mode: "simple",
        text: section.text || section.title,
        issues: currentIssues
      });

      currentSummary = result.summary;
      setOutputValue(currentSummary, `Simplified: ${section.title}`);
    } catch (error) {
      const fallback = generateFallbackSummary(section.text || section.title);
      currentSummary = fallback;
      setOutputValue("AI simplification unavailable, so AccessBridge made a quick local version instead.\n\n" + fallback, `Simplified: ${section.title}`);
      console.error(error);
    } finally {
      stopLoading();
    }
  }

  async function selectStudentMode(profileId) {
    const selectedProfile = profileId || "general";
    const profileSelect = document.getElementById("ab-profile");
    if (profileSelect) profileSelect.value = selectedProfile;

    document.querySelectorAll(".ab-mode-card").forEach((card) => {
      const active = card.dataset.profile === selectedProfile;
      card.classList.toggle("ab-mode-card-active", active);
      card.setAttribute("aria-pressed", String(active));
    });

    updateModeDescription(selectedProfile);
    savePreferences();

    if (selectedProfile !== "low-vision") {
      // keeps the last color and slider choices but turns the page effect off when leaving low vision
      saveLowVisionSettings();
      removeLowVisionAdjuster({ keepHalfDock: false });
    }

    // switching away from text to speech clears the paused audio stuff and yellow word marks
    if (selectedProfile !== "audio") {
      clearSpeechInteractionForModeSwitch();
    }

    // mode buttons change the page but they should not write random selected text in the result box
    applyPageAdaptation(selectedProfile, { preserveLowVision: true });

    if (selectedProfile === "low-vision") {
      openLowVisionAdjuster();
      updateResultCard(
        "Low Vision Adjuster ready",
        "The page now has a separate display adjustment box. AccessBridge is half-minimized so the options remain visible. Click the adjustment box to make changes; the main panel will collapse into the small bar so you can see the page while adjusting."
      );
      setSpeechStatus("Low Vision Adjuster ready", "Display controls are available in the separate box.", "done");
      setLiveStatus("Low Vision Adjuster opened.");
      return;
    }

    if (selectedProfile === "audio") {
      preparePageReadAloudFromMode();
      return;
    }

    if (selectedProfile === "reading") {
      await simplifyPage({ buttonId: "ab-mode-reading", loadingTitle: "Simplifying language...", resultTitle: "Simplified page" });
      return;
    }

    setLiveStatus(`${getProfileDetails(selectedProfile).name} selected.`);
  }


  function minimizePanelToLowVisionDock() {
    const panel = document.getElementById("ab-panel");
    if (!panel) return;

    panel.classList.remove("ab-panel-minimized");
    panel.classList.remove("ab-panel-page-preview");
    panel.classList.add("ab-panel-half-minimized");
    panel.setAttribute(
      "aria-label",
      "AccessBridge Low Vision Adjuster is open. The panel is half minimized below the options."
    );

    const liveStatus = document.getElementById("ab-live-status");
    if (liveStatus) {
      liveStatus.textContent = "Low Vision Adjuster opened. AccessBridge is half minimized below the options.";
    }
  }

  function cloneLowVisionSettings(settings = {}) {
    return {
      ...LOW_VISION_DEFAULTS,
      ...(settings || {})
    };
  }

  function openLowVisionAdjuster() {
    minimizePanelToLowVisionDock();

    let adjuster = document.getElementById("ab-low-vision-adjuster");
    if (!adjuster) {
      adjuster = createLowVisionAdjusterBox();
      document.body.appendChild(adjuster);
      bindLowVisionAdjusterEvents(adjuster);
    }

    adjuster.hidden = false;
    adjuster.classList.remove("ab-low-vision-adjuster-minimized");
    adjuster.classList.remove("ab-low-vision-adjuster-active");
    adjuster.setAttribute("aria-label", "Low Vision Adjuster display controls");
    hydrateLowVisionControls();
    applyLowVisionSettings(lowVisionSettings, { saveState: false });
    saveLowVisionActiveState(true);

    loadLowVisionSettingsFromStorage().then((savedSettings) => {
      lowVisionSettings = savedSettings;
      hydrateLowVisionControls();
      applyLowVisionSettings(lowVisionSettings, { saveState: false });
      saveLowVisionSnapshot(true);
    });
  }

  function createLowVisionAdjusterBox() {
    const adjuster = document.createElement("aside");
    adjuster.id = "ab-low-vision-adjuster";
    adjuster.setAttribute("role", "dialog");
    adjuster.setAttribute("aria-modal", "false");
    adjuster.setAttribute("aria-label", "Low Vision Adjuster display controls");
    adjuster.innerHTML = `
      <header class="ab-lv-header">
        <div>
          <span class="ab-lv-kicker">Low Vision Adjuster</span>
          <h2>Display and tone</h2>
          <p>Reduce glare, tune color, enlarge text, and improve spacing while you view the page.</p>
        </div>
        <button id="ab-lv-close" class="ab-lv-icon-button" type="button" aria-label="Close Low Vision Adjuster">×</button>
      </header>

      <label class="ab-lv-field">
        <span>Preset</span>
        <select id="ab-lv-preset">
          <option value="comfort">Comfort tint</option>
          <option value="dark">Dark mode</option>
          <option value="light">Soft light mode</option>
          <option value="high-contrast">High contrast (soft dark)</option>
          <option value="amber">Amber night tone</option>
          <option value="monochrome">Monochrome</option>
        </select>
      </label>

      <div class="ab-lv-slider-grid" aria-label="Visual adjustment sliders">
        <label>
          <span>Brightness</span>
          <input id="ab-lv-brightness" type="range" min="45" max="115" step="5">
          <output id="ab-lv-brightness-value"></output>
        </label>
        <label>
          <span>Contrast</span>
          <input id="ab-lv-contrast" type="range" min="80" max="160" step="5">
          <output id="ab-lv-contrast-value"></output>
        </label>
        <label>
          <span>Saturation</span>
          <input id="ab-lv-saturation" type="range" min="0" max="140" step="5">
          <output id="ab-lv-saturation-value"></output>
        </label>
        <label>
          <span>Warmth</span>
          <input id="ab-lv-warmth" type="range" min="0" max="100" step="5">
          <output id="ab-lv-warmth-value"></output>
        </label>
        <label>
          <span>Text size</span>
          <input id="ab-lv-text-scale" type="range" min="100" max="150" step="5">
          <output id="ab-lv-text-scale-value"></output>
        </label>
        <label>
          <span>Line height</span>
          <input id="ab-lv-line-height" type="range" min="140" max="210" step="5">
          <output id="ab-lv-line-height-value"></output>
        </label>
        <label>
          <span>Letters</span>
          <input id="ab-lv-letter-spacing" type="range" min="0" max="12" step="1">
          <output id="ab-lv-letter-spacing-value"></output>
        </label>
        <label>
          <span>Words</span>
          <input id="ab-lv-word-spacing" type="range" min="0" max="20" step="1">
          <output id="ab-lv-word-spacing-value"></output>
        </label>
        <label>
          <span>Images</span>
          <input id="ab-lv-image-dim" type="range" min="50" max="100" step="5">
          <output id="ab-lv-image-dim-value"></output>
        </label>
      </div>

      <div class="ab-lv-toggle-grid">
        <label><input id="ab-lv-underline-links" type="checkbox"> Always underline links</label>
        <label><input id="ab-lv-bold-text" type="checkbox"> Heavier text</label>
        <label><input id="ab-lv-reduce-motion" type="checkbox"> Reduce motion</label>
      </div>

      <div class="ab-lv-actions">
        <button id="ab-lv-reset" type="button">Reset</button>
        <button id="ab-lv-turn-off" type="button">Turn off</button>
        <button id="ab-lv-keep" type="button">Close controls</button>
      </div>

      <p class="ab-lv-note">Tip: click or tab into these controls to make this box translucent. Click the page to minimize Display & Tone into the bottom-right bar. Your visual settings stay active until you press Turn off.</p>
    `;
    return adjuster;
  }

  function bindLowVisionAdjusterEvents(adjuster) {
    const activateAdjustmentMode = (event) => {
      if (adjuster.classList.contains("ab-low-vision-adjuster-minimized")) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        expandLowVisionAdjusterFromBar();
        return;
      }

      adjuster.classList.add("ab-low-vision-adjuster-active");
      minimizePanelToBar();
      saveLowVisionSnapshot(true);
      setLiveStatus("Display and tone controls are active. AccessBridge is minimized so the full page stays visible.");
    };

    adjuster.addEventListener("pointerdown", activateAdjustmentMode, true);
    adjuster.addEventListener("focusin", activateAdjustmentMode);

    const preset = adjuster.querySelector("#ab-lv-preset");
    preset?.addEventListener("change", () => {
      const selectedPreset = preset.value || "comfort";
      lowVisionSettings = cloneLowVisionSettings(LOW_VISION_PRESETS[selectedPreset] || LOW_VISION_DEFAULTS);
      hydrateLowVisionControls();
      applyLowVisionSettings(lowVisionSettings);
      saveLowVisionSnapshot(true);
    });

    adjuster.querySelectorAll("input[type='range'], input[type='checkbox']").forEach((control) => {
      control.addEventListener("input", () => {
        lowVisionSettings = readLowVisionControls();
        applyLowVisionSettings(lowVisionSettings);
        saveLowVisionSnapshot(true);
      });
      control.addEventListener("change", () => {
        lowVisionSettings = readLowVisionControls();
        applyLowVisionSettings(lowVisionSettings);
        saveLowVisionSnapshot(true);
      });
    });

    adjuster.querySelector("#ab-lv-reset")?.addEventListener("click", () => {
      lowVisionSettings = cloneLowVisionSettings(LOW_VISION_DEFAULTS);
      hydrateLowVisionControls();
      applyLowVisionSettings(lowVisionSettings);
      saveLowVisionSnapshot(true);
    });

    adjuster.querySelector("#ab-lv-turn-off")?.addEventListener("click", () => {
      // turns off the page effect but remembers the settings for next time
      saveLowVisionSettings();
      saveLowVisionActiveState(false);
      clearPageAdaptations({ preserveLowVision: false });
      clearLowVisionVisualState({ saveState: false });
      removeLowVisionAdjuster({ keepHalfDock: false });
      setLiveStatus("Display and tone adjustments turned off. Your last settings were saved.");
    });

    const closeControlsButKeepSettings = () => {
      saveLowVisionSnapshot(true);
      removeLowVisionAdjuster({ keepHalfDock: false });
      setLiveStatus("Display and tone controls closed. Your visual settings are still active and saved.");
    };

    adjuster.querySelector("#ab-lv-close")?.addEventListener("click", closeControlsButKeepSettings);
    adjuster.querySelector("#ab-lv-keep")?.addEventListener("click", closeControlsButKeepSettings);
  }

  function minimizeLowVisionAdjusterToBar() {
    const adjuster = document.getElementById("ab-low-vision-adjuster");
    if (!adjuster || adjuster.hidden || adjuster.classList.contains("ab-low-vision-adjuster-minimized")) return;

    saveLowVisionSnapshot(true);
    adjuster.classList.remove("ab-low-vision-adjuster-active");
    adjuster.classList.add("ab-low-vision-adjuster-minimized");
    adjuster.setAttribute(
      "aria-label",
      "Display and tone controls are minimized. Click the Display and tone bar to expand."
    );

    const liveStatus = document.getElementById("ab-live-status");
    if (liveStatus) liveStatus.textContent = "Display and tone minimized. Visual settings remain active.";
  }

  function expandLowVisionAdjusterFromBar() {
    const adjuster = document.getElementById("ab-low-vision-adjuster");
    if (!adjuster) return;

    // display and tone opens as the main thing so accessbridge stays minimized
    minimizePanelToBar();

    adjuster.hidden = false;
    adjuster.classList.remove("ab-low-vision-adjuster-minimized");
    adjuster.classList.add("ab-low-vision-adjuster-active");
    adjuster.setAttribute("aria-label", "Display and tone controls are open. AccessBridge is minimized.");

    hydrateLowVisionControls();
    applyLowVisionSettings(lowVisionSettings, { saveState: false });
    saveLowVisionSnapshot(true);

    const liveStatus = document.getElementById("ab-live-status");
    if (liveStatus) liveStatus.textContent = "Display and tone controls expanded.";
  }

  function hydrateLowVisionControls() {
    const settings = cloneLowVisionSettings(lowVisionSettings);
    const setValue = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.value = String(value);
    };
    const setChecked = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.checked = Boolean(value);
    };

    setValue("ab-lv-preset", settings.preset);
    setValue("ab-lv-brightness", settings.brightness);
    setValue("ab-lv-contrast", settings.contrast);
    setValue("ab-lv-saturation", settings.saturation);
    setValue("ab-lv-warmth", settings.warmth);
    setValue("ab-lv-text-scale", settings.textScale);
    setValue("ab-lv-line-height", settings.lineHeight);
    setValue("ab-lv-letter-spacing", settings.letterSpacing);
    setValue("ab-lv-word-spacing", settings.wordSpacing);
    setValue("ab-lv-image-dim", settings.imageDim);
    setChecked("ab-lv-underline-links", settings.underlineLinks);
    setChecked("ab-lv-bold-text", settings.boldText);
    setChecked("ab-lv-reduce-motion", settings.reduceMotion);
    updateLowVisionControlLabels(settings);
  }

  function readLowVisionControls() {
    const numberValue = (id, fallback) => {
      const value = Number(document.getElementById(id)?.value);
      return Number.isFinite(value) ? value : fallback;
    };
    const checkedValue = (id, fallback) => {
      const element = document.getElementById(id);
      return element ? Boolean(element.checked) : fallback;
    };

    return cloneLowVisionSettings({
      preset: document.getElementById("ab-lv-preset")?.value || lowVisionSettings.preset || "comfort",
      brightness: numberValue("ab-lv-brightness", LOW_VISION_DEFAULTS.brightness),
      contrast: numberValue("ab-lv-contrast", LOW_VISION_DEFAULTS.contrast),
      saturation: numberValue("ab-lv-saturation", LOW_VISION_DEFAULTS.saturation),
      warmth: numberValue("ab-lv-warmth", LOW_VISION_DEFAULTS.warmth),
      textScale: numberValue("ab-lv-text-scale", LOW_VISION_DEFAULTS.textScale),
      lineHeight: numberValue("ab-lv-line-height", LOW_VISION_DEFAULTS.lineHeight),
      letterSpacing: numberValue("ab-lv-letter-spacing", LOW_VISION_DEFAULTS.letterSpacing),
      wordSpacing: numberValue("ab-lv-word-spacing", LOW_VISION_DEFAULTS.wordSpacing),
      imageDim: numberValue("ab-lv-image-dim", LOW_VISION_DEFAULTS.imageDim),
      underlineLinks: checkedValue("ab-lv-underline-links", LOW_VISION_DEFAULTS.underlineLinks),
      boldText: checkedValue("ab-lv-bold-text", LOW_VISION_DEFAULTS.boldText),
      reduceMotion: checkedValue("ab-lv-reduce-motion", LOW_VISION_DEFAULTS.reduceMotion)
    });
  }

  function updateLowVisionControlLabels(settings = lowVisionSettings) {
    const setText = (id, text) => {
      const element = document.getElementById(id);
      if (element) element.textContent = text;
    };

    setText("ab-lv-brightness-value", `${settings.brightness}%`);
    setText("ab-lv-contrast-value", `${settings.contrast}%`);
    setText("ab-lv-saturation-value", `${settings.saturation}%`);
    setText("ab-lv-warmth-value", `${settings.warmth}%`);
    setText("ab-lv-text-scale-value", `${settings.textScale}%`);
    setText("ab-lv-line-height-value", `${settings.lineHeight}%`);
    setText("ab-lv-letter-spacing-value", `${settings.letterSpacing}%`);
    setText("ab-lv-word-spacing-value", `${settings.wordSpacing}%`);
    setText("ab-lv-image-dim-value", `${settings.imageDim}%`);
  }

  function applyLowVisionSettings(settings = lowVisionSettings, options = {}) {
    const root = document.documentElement;
    const normalized = cloneLowVisionSettings(settings);
    lowVisionSettings = normalized;

    root.classList.add("ab-low-vision-active");
    lowVisionActiveOnPage = true;
    Object.keys(LOW_VISION_PRESETS).forEach((preset) => {
      root.classList.remove(`ab-low-vision-theme-${preset}`);
    });
    root.classList.add(`ab-low-vision-theme-${normalized.preset}`);
    root.classList.toggle("ab-low-vision-underlined-links", Boolean(normalized.underlineLinks));
    root.classList.toggle("ab-low-vision-bold-text", Boolean(normalized.boldText));
    root.classList.toggle("ab-low-vision-reduced-motion", Boolean(normalized.reduceMotion));

    root.style.setProperty("--ab-lv-text-scale", String(normalized.textScale / 100));
    root.style.setProperty("--ab-lv-line-height", String((normalized.lineHeight / 100).toFixed(2)));
    root.style.setProperty("--ab-lv-letter-spacing", `${normalized.letterSpacing / 100}em`);
    root.style.setProperty("--ab-lv-word-spacing", `${normalized.wordSpacing / 100}em`);
    root.style.setProperty("--ab-lv-content-filter", `contrast(${normalized.contrast}%) saturate(${normalized.saturation}%)`);
    root.style.setProperty("--ab-lv-image-filter", `brightness(${normalized.imageDim}%) contrast(${Math.max(95, normalized.contrast)}%) saturate(${normalized.saturation}%)`);

    ensureLowVisionScreenFilter(normalized);
    updateLowVisionControlLabels(normalized);

    if (options.saveState !== false) {
      saveLowVisionSnapshot(true);
    }
  }

  function ensureLowVisionScreenFilter(settings) {
    let filter = document.getElementById("ab-low-vision-screen-filter");
    if (!filter) {
      filter = document.createElement("div");
      filter.id = "ab-low-vision-screen-filter";
      filter.setAttribute("aria-hidden", "true");
      document.body.appendChild(filter);
    }

    const brightness = Number(settings.brightness || 100);
    const warmth = Number(settings.warmth || 0);
    const dimAlpha = brightness < 100 ? Math.min(0.65, ((100 - brightness) / 100) * 0.9) : 0;
    const brightenAlpha = brightness > 100 ? Math.min(0.18, ((brightness - 100) / 100) * 0.55) : 0;
    const warmthAlpha = Math.min(0.35, (warmth / 100) * 0.35);
    const layers = [];

    if (warmthAlpha > 0) {
      layers.push(`linear-gradient(rgba(255, 190, 95, ${warmthAlpha}), rgba(255, 190, 95, ${warmthAlpha}))`);
    }
    if (dimAlpha > 0) {
      layers.push(`linear-gradient(rgba(0, 0, 0, ${dimAlpha}), rgba(0, 0, 0, ${dimAlpha}))`);
    }
    if (brightenAlpha > 0) {
      layers.push(`linear-gradient(rgba(255, 255, 255, ${brightenAlpha}), rgba(255, 255, 255, ${brightenAlpha}))`);
    }

    filter.style.background = layers.length ? layers.join(", ") : "transparent";
  }

  function clearLowVisionVisualState(options = {}) {
    const root = document.documentElement;
    root.classList.remove(
      "ab-low-vision-active",
      "ab-low-vision-underlined-links",
      "ab-low-vision-bold-text",
      "ab-low-vision-reduced-motion"
    );

    Object.keys(LOW_VISION_PRESETS).forEach((preset) => {
      root.classList.remove(`ab-low-vision-theme-${preset}`);
    });

    [
      "--ab-lv-text-scale",
      "--ab-lv-line-height",
      "--ab-lv-letter-spacing",
      "--ab-lv-word-spacing",
      "--ab-lv-content-filter",
      "--ab-lv-image-filter"
    ].forEach((property) => root.style.removeProperty(property));

    document.getElementById("ab-low-vision-screen-filter")?.remove();

    lowVisionActiveOnPage = false;
    if (options.saveState !== false) {
      saveLowVisionActiveState(false);
    }
  }

  function removeLowVisionAdjuster(options = {}) {
    const adjuster = document.getElementById("ab-low-vision-adjuster");
    if (adjuster) {
      // closing the controls should not wipe out the choices
      saveLowVisionSettings();
      adjuster.remove();
    }

    const panel = document.getElementById("ab-panel");
    if (panel && !options.keepHalfDock) {
      panel.classList.remove("ab-panel-half-minimized");
      if (!panel.classList.contains("ab-panel-minimized")) {
        panel.setAttribute(
          "aria-label",
          "AccessBridge accessibility assistant. Press Alt plus X to reopen."
        );
      }
    }
  }

  function loadLowVisionSettingsFromStorage() {
    return new Promise((resolve) => {
      if (!chrome?.storage?.local) {
        resolve(cloneLowVisionSettings(lowVisionSettings));
        return;
      }

      try {
        chrome.storage.local.get([LOW_VISION_STORAGE_KEY], (result) => {
          const stored = result?.[LOW_VISION_STORAGE_KEY];
          // handles old saved settings and the newer saved settings
          const settings = stored?.settings || stored || lowVisionSettings;
          resolve(cloneLowVisionSettings(settings));
        });
      } catch (error) {
        console.error("Could not load low vision settings:", error);
        resolve(cloneLowVisionSettings(lowVisionSettings));
      }
    });
  }

  function loadLowVisionActiveStateFromStorage() {
    return new Promise((resolve) => {
      if (!chrome?.storage?.local) {
        resolve(Boolean(lowVisionActiveOnPage));
        return;
      }

      try {
        chrome.storage.local.get([LOW_VISION_STATE_STORAGE_KEY], (result) => {
          resolve(Boolean(result?.[LOW_VISION_STATE_STORAGE_KEY]?.isActive));
        });
      } catch (error) {
        console.error("Could not load low vision active state:", error);
        resolve(Boolean(lowVisionActiveOnPage));
      }
    });
  }

  function saveLowVisionSettings() {
    if (!chrome?.storage?.local) return;

    try {
      chrome.storage.local.set({ [LOW_VISION_STORAGE_KEY]: cloneLowVisionSettings(lowVisionSettings) });
    } catch (error) {
      console.error("Could not save low vision settings:", error);
    }
  }

  function saveLowVisionActiveState(isActive) {
    lowVisionActiveOnPage = Boolean(isActive);
    if (!chrome?.storage?.local) return;

    try {
      chrome.storage.local.set({
        [LOW_VISION_STATE_STORAGE_KEY]: {
          isActive: lowVisionActiveOnPage
        }
      });
    } catch (error) {
      console.error("Could not save low vision active state:", error);
    }
  }

  function saveLowVisionSnapshot(isActive = lowVisionActiveOnPage) {
    saveLowVisionSettings();
    saveLowVisionActiveState(isActive);
  }

  function restoreLowVisionFromStorage() {
    Promise.all([loadLowVisionSettingsFromStorage(), loadLowVisionActiveStateFromStorage()])
      .then(([savedSettings, wasActive]) => {
        lowVisionSettings = savedSettings;
        if (wasActive) {
          applyLowVisionSettings(lowVisionSettings, { saveState: false });
          lowVisionActiveOnPage = true;
        }
      })
      .catch((error) => {
        console.error("Could not restore Low Vision settings:", error);
      });
  }

  function enterPanelPagePreview() {
    const panel = document.getElementById("ab-panel");
    if (!panel) return;

    panel.classList.add("ab-panel-page-preview");
    panel.setAttribute(
      "aria-label",
      "AccessBridge page preview controls. Click the panel to expand full controls."
    );
  }

  function exitPanelPagePreview() {
    const panel = document.getElementById("ab-panel");
    if (!panel) return;

    panel.classList.remove("ab-panel-page-preview");
    panel.setAttribute(
      "aria-label",
      "AccessBridge accessibility assistant. Press Alt plus X to reopen."
    );
  }

  function updateModeDescription(profileId) {
    const description = document.getElementById("ab-mode-description");
    if (!description) return;

    const descriptions = {
      general: "Scans, summarizes, and prepares student support.",
      reading: " simplify the page. Go to results",
      audio: "Audio support for listening.",
      focus: "Pulls out deadlines, contacts, forms.",
      "low-vision": " makes it easy on your eyes"
    };

    description.innerHTML = `<strong>What it does:</strong> ${descriptions[profileId] || descriptions.general}`;
  }

  function getWhyThisMatters(type) {
    const impacts = {
      "Missing alt text": "Students using screen readers or image-free browsing may not know what the image contains.",
      "Empty alt text": "Meaningful images with empty alt text can be skipped by assistive technology.",
      "Suspicious image filenames": "Generic image files may contain important information without a useful description.",
      "SVGs without labels": "Screen readers may announce the graphic poorly or skip its meaning.",
      "Possible chart or diagram images": "Charts, maps, and diagrams often need text explanations so students can understand the same information.",
      "Canvas without fallback text": "Canvas content may be invisible to screen readers unless a text alternative is provided.",
      "Dense text": "Students with dyslexia, ADHD, fatigue, or cognitive load needs may have trouble processing large blocks of text.",
      "No headings": "Headings help students and assistive technology users scan and navigate the page quickly.",
      "Multiple main headings": "Multiple H1 headings can make the page structure confusing.",
      "Heading order issue": "Skipped heading levels can make screen reader navigation feel disorganized.",
      "Unlabeled form fields": "Students using screen readers may not know what information a field is asking for.",
      "Placeholder-only labels": "Placeholder text can disappear while typing and may not work as a reliable label.",
      "Required fields not clearly marked": "Students may miss required information and submit incomplete forms.",
      "Small form controls": "Small controls can be difficult for students with motor, tremor, or low-vision needs.",
      "Vague link text": "Links like click here do not explain the destination when read out of context.",
      "Empty links": "A link without a name may be announced as blank or confusing by assistive technology.",
      "Repeated links with different destinations": "Repeated link text can make it unclear which link goes where.",
      "Unnamed buttons": "Icon-only or unnamed buttons can be impossible to understand with screen readers.",
      "Possible missing captions": "Deaf or hard-of-hearing students may miss spoken information without captions.",
      "Audio without transcript link": "Transcripts help students who cannot hear audio or prefer reading.",
      "Autoplaying media": "Autoplay can distract students and interfere with screen readers or concentration.",
      "Iframes without titles": "Iframe titles explain embedded content before students enter it.",
      "Tables without captions": "Captions help students understand what a table is about before reading the cells.",
      "Tables without headers": "Headers help students understand relationships between rows and columns.",
      "Positive tabindex": "Positive tabindex can create an unexpected keyboard navigation order.",
      "Many interactive elements": "Lots of controls can make keyboard navigation tiring without clear focus order.",
      "Low readable text": "Important information may be trapped in images, scans, or widgets that normal text tools cannot read."
    };

    return impacts[type] || "This may make the page harder to understand, navigate, or use with assistive technology.";
  }

  function getSuggestedFix(type) {
    const fixes = {
      "Missing alt text": "Add meaningful alt text for important images.",
      "Empty alt text": "Confirm the image is decorative or add a meaningful description.",
      "Suspicious image filenames": "Review whether the image contains meaningful information that needs alt text.",
      "SVGs without labels": "Add title, aria-label, or aria-labelledby to the SVG.",
      "Possible chart or diagram images": "Provide a text explanation of charts, maps, or diagrams.",
      "Canvas without fallback text": "Provide a text alternative for the canvas content.",
      "Dense text": "Break text into shorter sections, bullets, or steps.",
      "No headings": "Add clear headings so students can navigate the page structure.",
      "Multiple main headings": "Use one primary H1 and organize sections below it.",
      "Heading order issue": "Avoid skipping heading levels.",
      "Unlabeled form fields": "Connect each form field to a visible label or aria-label.",
      "Placeholder-only labels": "Use persistent labels, not placeholder-only instructions.",
      "Required fields not clearly marked": "Clearly mark required fields in text and code.",
      "Vague link text": "Use link text that describes the destination or action.",
      "Empty links": "Add readable link text or an accessible name.",
      "Repeated links with different destinations": "Make repeated links distinguishable.",
      "Unnamed buttons": "Add visible button text or aria-label.",
      "Possible missing captions": "Add captions or a transcript for media.",
      "Audio without transcript link": "Provide a transcript near the audio.",
      "Autoplaying media": "Avoid autoplay or provide controls.",
      "Iframes without titles": "Add a title describing the embedded content.",
      "Tables without captions": "Add a table caption when the table needs context.",
      "Tables without headers": "Use header cells for row/column meaning.",
      "Positive tabindex": "Avoid positive tabindex values; use natural DOM order.",
      "Many interactive elements": "Check focus order and visible focus styles.",
      "Low readable text": "Use OCR or provide a readable text alternative."
    };

    return fixes[type] || "Review this issue and provide an accessible alternative when needed.";
  }

  function getSeverityClass(severity) {
    const normalized = String(severity || "").toLowerCase();

    if (normalized === "high") return "ab-issue-high";
    if (normalized === "medium") return "ab-issue-medium";
    return "ab-issue-low";
  }

  function getIssueCounts(issues) {
    return issues.reduce(
      (counts, issue) => {
        const severity = String(issue.severity || "").toLowerCase();

        if (severity === "high") counts.high += 1;
        else if (severity === "medium") counts.medium += 1;
        else counts.low += 1;

        return counts;
      },
      { high: 0, medium: 0, low: 0 }
    );
  }

  function calculateAccessibilityScore(issues) {
    let score = 100;

    issues.forEach((issue) => {
      const count = Math.max(1, Number(issue.count || 1));
      const cappedCount = Math.min(count, 5);

      if (issue.severity === "High") score -= 12 + cappedCount * 2;
      else if (issue.severity === "Medium") score -= 7 + cappedCount;
      else score -= 3 + Math.min(cappedCount, 2);
    });

    return Math.max(score, 0);
  }

  function getScoreInfo(score) {
    if (score >= 85) {
      return {
        label: "Strong support",
        description: "The basic scan found only a few possible barriers.",
        className: "ab-score-good"
      };
    }

    if (score >= 65) {
      return {
        label: "Needs review",
        description: "The page may create some access challenges for students.",
        className: "ab-score-medium"
      };
    }

    return {
      label: "High friction",
      description: "The page may be difficult for some students to access without support.",
      className: "ab-score-low"
    };
  }

  function getTopConcern(issues) {
    if (issues.length === 0) {
      return "No obvious barriers were detected by the basic scan.";
    }

    const priority = { High: 3, Medium: 2, Low: 1 };
    const sorted = [...issues].sort((a, b) => {
      return (priority[b.severity] || 0) - (priority[a.severity] || 0);
    });

    return `${sorted[0].type}: ${sorted[0].message}`;
  }

  function getRecommendedNextStep(issues, text) {
    const hasLowText = issues.some((issue) => issue.type === "Low readable text");
    const hasDenseText = issues.some((issue) => issue.type === "Dense text");
    const hasImages = issues.some((issue) => issue.type.includes("alt") || issue.type.includes("chart") || issue.type.includes("Canvas"));
    const hasForms = issues.some((issue) => issue.type.includes("form") || issue.type.includes("Required") || issue.type.includes("Placeholder"));
    const hasMedia = issues.some((issue) => issue.type.includes("captions") || issue.type.includes("Audio"));

    if (hasLowText || hasImages) {
      return {
        title: "Try Screenshot / OCR first",
        message: "This page may rely on images, scanned content, charts, or other visual information. Screenshot explanation can extract and explain what is visible."
      };
    }

    if (hasForms) {
      return {
        title: "Use Page Navigator before submitting forms",
        message: "Some form fields may be hard to use with assistive technology. Use Page Navigator to jump to forms, then use the report tools if you need help."
      };
    }

    if (hasMedia) {
      return {
        title: "Check for captions or transcripts",
        message: "This page may include media without caption tracks or transcript links. Consider generating a barrier report."
      };
    }

    if (hasDenseText || text.length > 3500) {
      return {
        title: "Try Simplify Language or Reading Mode",
        message: "This page has enough text that a simpler version and clean reading layout may help."
      };
    }

    return {
      title: "Use Adapt this page for a guided result",
      message: "AccessBridge can personalize the page, summarize content, highlight the main concerns, and recommend support options."
    };
  }

  // sends extracted text to the back end for ai summary 
  async function summarizePage(options = {}) {
    if (!options || options instanceof Event) options = {};

    const buttonId = Object.prototype.hasOwnProperty.call(options, "buttonId") ? options.buttonId : "ab-summarize";
    const stopLoading = setButtonLoading(buttonId, options.loadingTitle || "Summarizing page...");
    const resultTitle = options.resultTitle || "Page summary";

    currentExtractedText = extractPageText();
    currentIssues = currentIssues.length ? currentIssues : scanAccessibilityIssues();

    setLiveStatus("Summarizing the page.");
    setOutputValue("Summarizing page...", resultTitle);

    try {
      const result = await callSummarizer({
        mode: "summary",
        text: currentExtractedText,
        issues: currentIssues
      });

      currentSummary = result.summary;
      setOutputValue(currentSummary, resultTitle);
    } catch (error) {
      currentSummary = generateFallbackSummary(currentExtractedText);
      setOutputValue(currentSummary, resultTitle);
      console.error(error);
    } finally {
      stopLoading();
      document.getElementById("ab-result-card")?.focus?.();
    }
  }

  // same ordeal with summarize page just simple version 
  async function simplifyPage(options = {}) {
    if (!options || options instanceof Event) options = {};

    const buttonId = Object.prototype.hasOwnProperty.call(options, "buttonId") ? options.buttonId : "ab-simplify";
    const stopLoading = setButtonLoading(buttonId, options.loadingTitle || "Simplifying language...");
    const resultTitle = options.resultTitle || "Simplified page";

    currentExtractedText = extractPageText();
    currentIssues = currentIssues.length ? currentIssues : scanAccessibilityIssues();

    setLiveStatus("Simplifying the page.");
    setOutputValue("Simplifying language...", resultTitle);

    try {
      const result = await callSummarizer({
        mode: "simple",
        text: currentExtractedText,
        issues: currentIssues
      });

      currentSummary = result.summary;
      setOutputValue(currentSummary, resultTitle);
    } catch (error) {
      currentSummary = generateFallbackSummary(currentExtractedText);
      setOutputValue(currentSummary, resultTitle);
      console.error(error);
    } finally {
      stopLoading();
      document.getElementById("ab-result-card")?.focus?.();
    }
  }

  async function rescuePage() {
    const output = document.getElementById("ab-output");
    const profile = getSelectedProfile();
    const requestId = ++adaptationRequestId;
    const stopLoading = setButtonLoading("ab-rescue", `Adapting page for ${profile.name}...`);

    setProgressState(1, "Step 1 of 4: scanning and parsing the page...");
    currentExtractedText = extractPageText();
    currentIssues = scanAccessibilityIssues();
    currentBarrierMap = buildBarrierMapEntries();
    currentPageSections = buildPageSections();
    refreshPageNavigator();
    refreshTopIssues();

    const score = calculateAccessibilityScore(currentIssues);
    const scoreInfo = getScoreInfo(score);
    const recommendedNextStep = getRecommendedNextStep(currentIssues, currentExtractedText);

    setLiveStatus(`Creating a local ${profile.name} adaptation.`);
    applyPageAdaptation(profile.id);

    const localFallback = generateProfileFallback(currentExtractedText, profile.id);
    currentSummary = formatAdaptationResult(localFallback, score, scoreInfo, recommendedNextStep, true, 0, profile);
    setProgressState(2, "Step 2 of 4: local result is ready. AI is enriching if available...");
    setOutputValue(currentSummary, `${profile.name} local result ready`);

    try {
      const result = await withTimeout(callSummarizer({
        mode: "adapt",
        profile: profile.id,
        profileName: profile.name,
        profileGoal: profile.goal,
        text: currentExtractedText,
        issues: currentIssues,
        recommendedNextStep
      }), 8000, "AI took too long. Local support is still available.");

      if (requestId !== adaptationRequestId) return;

      currentSummary = formatAdaptationResult(result.summary, score, scoreInfo, recommendedNextStep, false, 0, profile);
      setProgressState(3, "Step 3 of 4: AI-enhanced result is ready.");
      setOutputValue(currentSummary, `${profile.name} adaptation ready`);
    } catch (error) {
      if (requestId !== adaptationRequestId) return;
      setLiveStatus("AI is unavailable. Basic support still works.");
      updateResultCard(`${profile.name} local result ready`, currentSummary + "\n\nAI is unavailable right now, so AccessBridge kept the local adaptation.");
      console.error(error);
    } finally {
      if (requestId === adaptationRequestId) {
        runProfileFinishingAction(profile.id);
        setProgressState(4, "Step 4 of 4: adapted experience ready.");
        stopLoading();
        setLiveStatus(`${profile.name} adaptation ready.`);
      }
    }
  }

  function formatAdaptationResult(summary, score, scoreInfo, recommendedNextStep, usedFallback, highlightedCount, profile) {
    const issueText =
      currentIssues.length === 0
        ? "- No obvious barriers were detected by the scan."
        : currentIssues.map((i) => `- ${i.severity}: ${i.type} — ${i.message}`).join("\n");

    const impactText = generateStudentImpactBullets(currentIssues).join("\n");
    const profileActions = getProfileActionBullets(profile.id).join("\n");

    return `AccessBridge Adaptation Results

Status:
The page was adapted for ${profile.name}.
AccessBridge applied subtle page support. Use Show page markers only if you want to reveal possible issues visually.

Selected support mode:
${profile.name}
${profile.description}

AccessBridge Score:
${score}/100 — ${scoreInfo.label}
${scoreInfo.description}

Student impact:
${impactText}

Recommended next step:
${recommendedNextStep.title}
${recommendedNextStep.message}

How AccessBridge adapted this page:
${profileActions}

Student-friendly result:
${usedFallback ? "AI was unavailable, so this is a quick local adaptation.\n" : ""}${summary}

Top reasons this page may need support:
${currentIssues.length === 0 ? "- No major barriers found by the scan." : currentIssues.slice(0, 3).map((i) => `- ${i.severity}: ${i.type} — ${i.message}`).join("\n")}

What you can do next:
- Keep using the selected support mode if this page feels easier now.
- Switch modes if you need a different type of support.
- Use Reading Mode for a cleaner, larger-text view.
- Use Screenshot / OCR if important information appears trapped in images or scanned content.
- Use Ask This Page to find deadlines, requirements, or contact information.
- Use Generate Barrier Report if you need to contact SAS, IT, or a professor.

Note:
This is not an official WCAG compliance score. It is a student-facing estimate of how difficult this page may be to access.`;
  }

  function getSelectedProfile() {
    const profileId = document.getElementById("ab-profile")?.value || "general";
    return getProfileDetails(profileId);
  }

  function getProfileDetails(profileId) {
    const profiles = {
      general: {
        id: "general",
        name: "General Accessibility Rescue",
        goal: "scan, summarize, highlight barriers, and recommend support",
        description: "A balanced mode for students who want the page scanned, explained, summarized, and prepared for reporting."
      },
      reading: {
        id: "reading",
        name: "Reading Support",
        goal: "simplify dense text, increase spacing, and open a cleaner reading experience",
        description: "Designed for students who need dense text simplified, broken into sections, and shown with more readable spacing."
      },
      audio: {
        id: "audio",
        name: "Audio / Screen Reader Support",
        goal: "make content easier to listen to and identify screen-reader barriers",
        description: "Designed for students who prefer listening, use screen readers, or need image and structure support."
      },
      focus: {
        id: "focus",
        name: "Focus Mode",
        goal: "reduce clutter and turn the page into action steps",
        description: "Designed for students who need the main task, deadlines, forms, and next steps separated from distractions."
      },
      "low-vision": {
        id: "low-vision",
        name: "Low Vision Adjuster",
        goal: "reduce glare, tune color tone, increase size, spacing, contrast, and visual clarity",
        description: "Designed for students with sensitive eyes or low vision who need dark/light modes, lower glare, larger text, stronger contrast, clearer links, and bigger controls."
      }
    };

    return profiles[profileId] || profiles.general;
  }

  function getProfileActionBullets(profileId) {
    const actions = {
      general: [
        "- Scanned the page for possible accessibility barriers.",
        "- Created a student-friendly summary and recommended next steps.",
        "- Highlighted issues that may need review or reporting."
      ],
      reading: [
        "- Increased readable text spacing on the page.",
        "- Prepared the content for Reading Mode.",
        "- Prioritized simplification, key points, and action steps."
      ],
      audio: [
        "- Prepared the page result for read-aloud support.",
        "- Prioritized headings, images, labels, links, and visual-content barriers.",
        "- Kept Screenshot / OCR available for image or chart explanation."
      ],
      focus: [
        "- Reduced visual clutter from common navigation and sidebar areas.",
        "- Prioritized deadlines, forms, contacts, and next steps.",
        "- Turned the page into a more focused task checklist."
      ],
      "low-vision": [
        "- Increased visual emphasis on headings, links, buttons, and form controls.",
        "- Applied stronger contrast and larger interactive targets.",
        "- Kept Reading Mode available for a cleaner large-text overlay."
      ]
    };

    return actions[profileId] || actions.general;
  }

  function applyPageAdaptation(profileId, options = {}) {
    const preserveLowVision = options.preserveLowVision !== false;

    clearPageAdaptations({ preserveLowVision });

    document.documentElement.classList.add("ab-page-adapted");
    document.documentElement.classList.add(`ab-page-adapted-${profileId}`);

    if (profileId === "focus") {
      markLikelyMainTask();
    }

    if (profileId === "reading") {
      markReadableSections();
    }

    if (profileId === "audio") {
      markAudioSupportTargets();
    }

    if (profileId === "low-vision") {
      markClearPageSections();
      applyLowVisionSettings(lowVisionSettings);
      saveLowVisionSnapshot(true);
    }

    showAdaptationBanner(getProfileDetails(profileId));
  }

  function clearPageAdaptations(options = {}) {
    const preserveLowVision = Boolean(options.preserveLowVision);

    document.documentElement.classList.remove(
      "ab-page-adapted",
      "ab-page-adapted-general",
      "ab-page-adapted-reading",
      "ab-page-adapted-audio",
      "ab-page-adapted-focus",
      "ab-page-adapted-low-vision"
    );

    if (!preserveLowVision) {
      clearLowVisionVisualState();
    }

    document
      .querySelectorAll(
        ".ab-readable-section, .ab-main-task-section, .ab-audio-support-target, .ab-audio-support-target-active, .ab-clear-page-section, .ab-clear-section-heading"
      )
      .forEach((element) => {
        element.classList.remove(
          "ab-readable-section",
          "ab-main-task-section",
          "ab-audio-support-target",
          "ab-audio-support-target-active",
          "ab-clear-page-section",
          "ab-clear-section-heading"
        );

        if (element.dataset?.abAudioTargetBound) {
          element.removeAttribute("tabindex");
          element.removeAttribute("role");
          element.removeAttribute("aria-pressed");
          element.removeAttribute("aria-label");
          element.removeAttribute("title");
          delete element.dataset.abAudioTargetIndex;
        }
      });

    const banner = document.getElementById("ab-adaptation-banner");
    if (banner) banner.remove();
  }

  function showAdaptationBanner(profile) {
    const existing = document.getElementById("ab-adaptation-banner");
    if (existing) existing.remove();

    const banner = document.createElement("div");
    banner.id = "ab-adaptation-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-label", `${profile.name} is selected`);
    banner.innerHTML = `
      <strong>${escapeHTML(profile.name)}</strong>
      <button id="ab-clear-adaptation" type="button" aria-label="Clear AccessBridge page adaptation">×</button>
    `;

    document.body.appendChild(banner);
    document.getElementById("ab-clear-adaptation")?.addEventListener("click", () => {
      if (profile.id === "low-vision") {
        saveLowVisionSettings();
        saveLowVisionActiveState(false);
        clearPageAdaptations({ preserveLowVision: false });
        clearLowVisionVisualState({ saveState: false });
        removeLowVisionAdjuster();
        setLiveStatus("Low Vision display adjustments turned off. Your last settings were saved.");
        return;
      }

      clearPageAdaptations({ preserveLowVision: lowVisionActiveOnPage });
    });
  }

  function markReadableSections() {
    Array.from(document.querySelectorAll("p, li, blockquote")).forEach((element) => {
      if (element.innerText && element.innerText.trim().length > 80 && !element.closest("#ab-panel") && !element.closest("#ab-reading-mode-overlay")) {
        element.classList.add("ab-readable-section");
      }
    });
  }

  function markAudioSupportTargets() {
    // audio mode grabs the real text that should be read not just the headings
    let targets = getVisibleReadableElementsForAudio();

    if (targets.length === 0) {
      targets = [
        ...Array.from(document.querySelectorAll("main p, main li, main blockquote, article p, article li, article blockquote, form label, form legend")),
        ...Array.from(document.querySelectorAll("img:not([alt]), img[alt='']"))
      ];
    }

    targets.slice(0, 16).forEach((element, index) => {
      if (!element.closest("#ab-panel") && !element.closest("#ab-reading-mode-overlay")) {
        element.classList.add("ab-audio-support-target");
        element.dataset.abAudioTargetIndex = String(index);
        element.setAttribute("tabindex", "0");
        element.setAttribute("role", "button");
        element.setAttribute("aria-pressed", "false");
        element.setAttribute("aria-label", `Read from section ${index + 1}`);
        element.title = "Click to start reading from here";

        if (!element.dataset.abAudioTargetBound) {
          element.dataset.abAudioTargetBound = "true";
          element.addEventListener("click", (event) => {
            if (!element.classList.contains("ab-audio-support-target")) return;
            event.preventDefault();
            event.stopPropagation();
            startReadingFromAudioTarget(element);
          });
          element.addEventListener("keydown", (event) => {
            if (!element.classList.contains("ab-audio-support-target")) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              startReadingFromAudioTarget(element);
            }
          });
        }
      }
    });
  }

  function markClearPageSections() {
    const sectionCandidates = Array.from(document.querySelectorAll("main section, main article, article section, form, [role='main'] section"));
    const headings = Array.from(document.querySelectorAll("main h1, main h2, main h3, main h4, article h1, article h2, article h3, article h4, [role='main'] h1, [role='main'] h2, [role='main'] h3"));

    sectionCandidates.slice(0, 10).forEach((element) => {
      if (!element.closest("#ab-panel") && !element.closest("#ab-reading-mode-overlay")) {
        element.classList.add("ab-clear-page-section");
      }
    });

    headings.slice(0, 16).forEach((heading) => {
      if (!heading.closest("#ab-panel") && !heading.closest("#ab-reading-mode-overlay")) {
        heading.classList.add("ab-clear-section-heading");
      }
    });
  }

  function markLikelyMainTask() {
    const keywords = /(deadline|due|submit|form|required|contact|exam|accommodation|request|assignment|register|apply|appointment|meeting)/i;

    Array.from(document.querySelectorAll("p, li, section, article, form")).forEach((element) => {
      const text = element.innerText || "";
      if (keywords.test(text) && !element.closest("#ab-panel")) {
        element.classList.add("ab-main-task-section");
      }
    });
  }

  function runProfileFinishingAction(profileId) {
    if (profileId === "audio") {
      setSpeechStatus("Reading ready", "Audio support reads the page text and highlights words on the page.", "done");
      setLiveStatus("Audio support is ready.");
    }

    if (profileId === "focus") {
      const checklist = generateActionChecklist(currentExtractedText);
      if (checklist) {
        setOutputValue(`${document.getElementById("ab-output")?.value || ""}

Focus checklist:
${checklist}`, "Focus checklist ready");
      }
    }
  }


  function generateProfileFallback(text, profileId) {
    const base = generateFallbackSummary(text);

    if (profileId === "focus") {
      return `${base}\n\nFocus checklist:\n${generateActionChecklist(text)}`;
    }

    if (profileId === "reading") {
      return `${base}\n\nReading Support version:\n- The page has been prepared for larger spacing and Reading Mode.\n- Review the summary first, then use Ask This Page for deadlines or required steps.`;
    }

    if (profileId === "audio") {
      return `${base}\n\nAudio Support version:\n- Press Read to listen to this result.\n- Use Screenshot / OCR if the important information is inside an image, chart, or scanned document.`;
    }

    if (profileId === "low-vision") {
      return `${base}\n\nLow Vision version:\n- The page has been visually adjusted with larger emphasis on headings, links, and controls.\n- Open Reading Mode for a cleaner high-contrast view.`;
    }

    return base;
  }

  function generateActionChecklist(text) {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();
    if (!cleaned) return "- Try Screenshot / OCR because AccessBridge could not find enough readable text.";

    const sentences = cleaned
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => /(deadline|due|submit|form|required|contact|email|phone|office|exam|appointment|request|complete|bring|upload|register|apply)/i.test(sentence))
      .slice(0, 6);

    if (sentences.length === 0) {
      return "- Review the summary.\n- Ask: What do I need to do next?\n- Generate a report if the page is still hard to access.";
    }

    return sentences.map((sentence) => `- ${sentence.trim()}`).join("\n");
  }

  function generateStudentImpactBullets(issues) {
    const impacts = [];

    if (issues.some((issue) => issue.type.includes("alt") || issue.type.includes("image") || issue.type.includes("Canvas") || issue.type.includes("chart"))) {
      impacts.push("- Screen reader users or low-vision students may miss visual information.");
    }

    if (issues.some((issue) => issue.type.includes("Dense") || issue.type.includes("readable text"))) {
      impacts.push("- Students with dyslexia, ADHD, fatigue, or reading-related needs may struggle with dense or trapped text.");
    }

    if (issues.some((issue) => issue.type.includes("form") || issue.type.includes("Required") || issue.type.includes("Placeholder"))) {
      impacts.push("- Students using assistive technology may have trouble completing forms accurately.");
    }

    if (issues.some((issue) => issue.type.includes("captions") || issue.type.includes("Audio"))) {
      impacts.push("- Deaf or hard-of-hearing students may miss media content without captions or transcripts.");
    }

    if (issues.some((issue) => issue.type.includes("tabindex") || issue.type.includes("interactive") || issue.type.includes("button") || issue.type.includes("link"))) {
      impacts.push("- Keyboard and screen reader users may have trouble navigating controls or links.");
    }

    if (impacts.length === 0) {
      impacts.push("- The basic scan did not find major barriers, but students may still benefit from summary, reading mode, and audio support.");
    }

    return impacts;
  }

  function generateFallbackSummary(text) {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();

    if (!cleaned) {
      return "AccessBridge could not find enough readable text on this page. Try Screenshot / OCR.";
    }

    const sentences = cleaned
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean)
      .slice(0, 4)
      .join("\n");

    if (sentences.length > 80) {
      return `Quick local summary:\n\n${sentences}`;
    }

    return `Quick local summary:\n\n${cleaned.split(/\s+/).slice(0, 140).join("\n")}...`;
  }

  function setButtonLoading(buttonId, loadingTitle) {
    const button = document.getElementById(buttonId);

    if (!button) {
      return () => {};
    }

    const originalHtml = button.innerHTML;
    const isModeCard = button.classList.contains("ab-mode-card");

    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.classList.add("ab-button-loading");

    if (isModeCard) {
      button.innerHTML = `
        <span class="ab-loading-label">
          <span class="ab-loading-spinner" aria-hidden="true"></span>
          <span>${escapeHTML(loadingTitle)}</span>
        </span>
      `;
    } else {
      button.innerHTML = `
        <span class="ab-loading-label">
          <span class="ab-loading-spinner" aria-hidden="true"></span>
          <span class="ab-button-title">${escapeHTML(loadingTitle)}</span>
        </span>
        <span class="ab-button-subtitle">Please wait while AccessBridge works...</span>
      `;
    }

    return () => {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.classList.remove("ab-button-loading");
      button.innerHTML = originalHtml;
    };
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

  async function askPageBackend(payload) {
    const response = await chrome.runtime.sendMessage({
      type: "ASK_PAGE",
      payload
    });

    if (!response || !response.ok) {
      throw new Error(response?.error || "Ask-page request failed");
    }

    return response.data;
  }

  async function checkBackendStatus() {
    const backendStatus = document.getElementById("ab-backend-status");
    const aiStatus = document.getElementById("ab-ai-status");
    const modelStatus = document.getElementById("ab-model-status");
    const backendCard = document.getElementById("ab-backend-card");

    try {
      const response = await chrome.runtime.sendMessage({ type: "PING_BACKEND" });

      if (!response || !response.ok) {
        throw new Error(response?.error || "Backend offline");
      }

      if (backendStatus) backendStatus.textContent = "Connected ✓";
      if (aiStatus) aiStatus.textContent = response.data?.aiConfigured ? "Ready ✓" : "Missing API key";
      if (modelStatus) modelStatus.textContent = response.data?.configuredModel || response.data?.model || "Not reported";
      if (backendCard) {
        backendCard.classList.remove("ab-backend-offline");
        backendCard.classList.add("ab-backend-online");
      }
    } catch (error) {
      if (backendStatus) backendStatus.textContent = "Offline";
      if (aiStatus) aiStatus.textContent = "Fallback mode";
      if (modelStatus) modelStatus.textContent = "Local fallback only";
      if (backendCard) {
        backendCard.classList.remove("ab-backend-online");
        backendCard.classList.add("ab-backend-offline");
      }
      console.error("Backend status check failed:", error);
    }
  }

  function setNaturalVoiceStatus(message, tone = "loading") {
    const status = document.getElementById("ab-natural-voice-status");
    if (!status) return;

    status.hidden = false;
    status.textContent = message;
    status.className = `ab-natural-voice-status ab-natural-voice-${tone}`;
  }

  function setNaturalVoiceButtonState(state = "idle") {
    const button = document.getElementById("ab-natural-voice");
    if (!button) return;

    button.disabled = state === "loading";
    button.classList.toggle("ab-button-loading", state === "loading");

    if (state === "loading") {
      button.innerHTML = `<span class="ab-loading-label"><span class="ab-loading-spinner" aria-hidden="true"></span>Preparing audio...</span>`;
      return;
    }

    if (state === "playing") {
      button.textContent = "Replay audio";
      return;
    }

    button.textContent = "Listen to result";
  }

  function stopNaturalVoiceAudio(updateStatus = true) {
    if (naturalVoiceAudio) {
      naturalVoiceAudio.onplay = null;
      naturalVoiceAudio.onpause = null;
      naturalVoiceAudio.onended = null;
      naturalVoiceAudio.onerror = null;
      naturalVoiceAudio.pause();
      naturalVoiceAudio.currentTime = 0;
      naturalVoiceAudio = null;
    }

    setNaturalVoiceButtonState("idle");

    if (updateStatus) {
      setNaturalVoiceStatus("AI natural voice stopped.", "warning");
    }
  }

  function getNaturalVoiceText() {
    const resultText = document.getElementById("ab-result-summary")?.innerText || "";
    const outputText = document.getElementById("ab-output")?.value || "";
    const text = resultText.trim() || outputText.trim() || currentSummary || currentExtractedText.slice(0, 1200);

    return String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);
  }

  function startResultBrowserFallback(text, sourceElement, reason = "AI voice is unavailable") {
    const fallbackText = String(text || "").replace(/\s+/g, " ").trim();

    if (!fallbackText) {
      setSpeechStatus("Nothing to read", "Generate a result first, then use AI voice.", "error");
      return;
    }

    setNaturalVoiceButtonState("idle");
    setNaturalVoiceStatus(`${reason}. Using browser speech fallback so the feature still works.`, "warning");
    setLiveStatus("AI voice unavailable. Browser speech fallback started.");
    speakText(fallbackText, "latest result", sourceElement);
  }

  async function readOutputWithNaturalVoice() {
    const resultSourceElement = document.getElementById("ab-result-summary");
    const text = getNaturalVoiceText();

    if (!text.trim()) {
      setNaturalVoiceStatus("Generate a result first, then use AI natural voice.", "warning");
      setSpeechStatus("Nothing to read", "Generate a result first, then use AI natural voice.", "error");
      return;
    }

    stopReading();
    stopNaturalVoiceAudio(false);
    pendingSpeechText = text;
    pendingSpeechSourceElements = resultSourceElement ? [resultSourceElement] : [];
    pendingSpeechSourceLabel = "latest result";

    setNaturalVoiceButtonState("loading");
    setNaturalVoiceStatus("Creating AI natural voice audio...", "loading");
    setSpeechStatus("Preparing AI voice...", "The result box uses AI natural voice first. Browser speech is only a backup if AI voice is unavailable.", "busy");
    setLiveStatus("Creating AI natural voice audio.");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "NATURAL_TTS",
        payload: {
          text,
          instructions: "Speak clearly, warmly, and calmly, like a supportive student accessibility assistant. Use a natural pace and avoid sounding robotic."
        }
      });

      if (!response || !response.ok) {
        throw new Error(response?.error || "AI natural voice request failed");
      }

      naturalVoiceAudio = new Audio(response.data.audioDataUrl);
      naturalVoiceAudio.preload = "auto";

      naturalVoiceAudio.onplay = () => {
        setNaturalVoiceButtonState("playing");
        setNaturalVoiceStatus("Playing AI natural voice.", "success");
        setSpeechStatus("AI voice playing", "Reading the result with AI natural voice.", "speaking");
        setLiveStatus("AI natural voice playback started.");
      };

      naturalVoiceAudio.onpause = () => {
        if (!naturalVoiceAudio) return;
        setNaturalVoiceStatus("AI natural voice paused.", "warning");
        setSpeechStatus("Paused", "AI natural voice is paused. Press Resume to continue.", "paused");
        setLiveStatus("AI natural voice paused.");
      };

      naturalVoiceAudio.onended = () => {
        setNaturalVoiceButtonState("idle");
        setNaturalVoiceStatus("AI natural voice finished.", "success");
        setSpeechStatus("Finished", "AI natural voice playback finished.", "done");
        setLiveStatus("AI natural voice playback finished.");
        naturalVoiceAudio = null;
      };

      naturalVoiceAudio.onerror = () => {
        const failedText = text;
        naturalVoiceAudio = null;
        startResultBrowserFallback(failedText, resultSourceElement, "AI natural voice audio could not play");
      };

      await naturalVoiceAudio.play();
    } catch (error) {
      console.error("AI natural voice failed:", error);
      naturalVoiceAudio = null;
      startResultBrowserFallback(text, resultSourceElement, `AI natural voice unavailable: ${error.message}`);
    }
  }

  function getVisibleReadableElementsForAudio() {
    const root = document.querySelector("main, article, [role='main']") || document.body;
    const selectors = [
      "p",
      "li",
      "blockquote",
      "figcaption",
      "td",
      "th",
      "label",
      "legend"
    ].join(", ");

    const elements = Array.from(root.querySelectorAll(selectors)).filter((element) => {
      if (!element || !element.isConnected) return false;
      if (element.closest("#ab-panel, #ab-reading-mode-overlay, #ab-adaptation-banner, #ab-speech-mini-controls, script, style, noscript, nav, footer, header, aside")) return false;

      const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
      if (text.length < 18) return false;

      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      if (rect.width === 0 && rect.height === 0) return false;

      return true;
    });

    // speech should start with real page text and not just headings
    const priority = elements.filter((element) => element.matches("p, li, blockquote"));
    return (priority.length >= 1 ? priority : elements).slice(0, 40);
  }

  function buildSpeechTextFromElements(elements, maxCharacters = 4500) {
    const chunks = [];
    let total = 0;

    elements.forEach((element) => {
      if (total >= maxCharacters) return;
      const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) return;

      const remaining = maxCharacters - total;
      const chunk = text.slice(0, remaining);
      chunks.push(chunk);
      total += chunk.length + 1;
    });

    return chunks.join(" ").replace(/\s+/g, " ").trim();
  }

  function getAudioSupportTargets() {
    return Array.from(document.querySelectorAll(".ab-audio-support-target")).filter((element) => {
      return element && element.isConnected && !element.closest("#ab-panel, #ab-reading-mode-overlay, #ab-adaptation-banner, #ab-speech-mini-controls");
    });
  }

  function startReadingFromAudioTarget(targetElement) {
    if (!targetElement || !targetElement.isConnected) return;

    stopNaturalVoiceAudio(false);
    window.speechSynthesis.cancel();
    clearSpeechHighlight(false);

    const targets = getAudioSupportTargets();
    const startIndex = Math.max(0, targets.indexOf(targetElement));
    const sourceElements = targets.slice(startIndex);
    const text = buildSpeechTextFromElements(sourceElements);

    if (!text) {
      setSpeechStatus("Nothing to read", "AccessBridge could not find readable text in that section.", "error");
      showSpeechMiniControls("selected section", "error");
      return;
    }

    getAudioSupportTargets().forEach((element) => {
      element.classList.remove("ab-audio-support-target-active");
      element.setAttribute("aria-pressed", "false");
    });
    targetElement.classList.add("ab-audio-support-target-active");
    targetElement.setAttribute("aria-pressed", "true");

    pendingSpeechText = text;
    pendingSpeechSourceElements = sourceElements;
    pendingSpeechSourceLabel = `section ${startIndex + 1}`;

    updateResultCard(
      "Reading selected section",
      "AccessBridge is reading from the section you clicked. Each word will highlight directly on the page."
    );

    minimizePanelToBar();
    startPendingSpeech();
  }

  function getPageReadAloudPayload() {
    const readableElements = getVisibleReadableElementsForAudio();
    let text = buildSpeechTextFromElements(readableElements);
    let sourceElements = readableElements;

    if (!text) {
      text = (currentExtractedText || extractPageText()).replace(/\s+/g, " ").trim().slice(0, 4500);
      sourceElements = [];
    }

    return {
      text,
      sourceElements
    };
  }

  function preparePageReadAloudFromMode() {
    stopNaturalVoiceAudio(false);
    window.speechSynthesis.cancel();
    clearSpeechHighlight(false);

    const payload = getPageReadAloudPayload();

    if (!payload.text) {
      pendingSpeechText = "";
      pendingSpeechSourceElements = [];
      setSpeechStatus("Nothing to read", "AccessBridge could not find readable page text. Try Screenshot / OCR.", "error");
      updateResultCard("Nothing readable found", "AccessBridge could not find enough page text to read. Try Screenshot / OCR if the content is inside an image or scan.");
      return;
    }

    pendingSpeechText = payload.text;
    pendingSpeechSourceElements = payload.sourceElements;
    pendingSpeechSourceLabel = "page text";
    autoMinimizeOnSpeechStart = false;

    updateResultCard(
      "Audio ready",
      "The dashed boxes show readable sections. Click any dashed box to start reading from there, or press Play to start from the first section. Words will highlight directly on the page."
    );

    setSpeechStatus("Choose where to start", "Click a dashed section to read from there, or press Play to start at the first section.", "ready");
    showSpeechMiniControls("page text", "ready");
    setLiveStatus("Audio sections selected. Click a section or press Play to start reading.");
  }

  function startPageReadAloudFromMode() {
    stopNaturalVoiceAudio(false);

    const payload = getPageReadAloudPayload();

    if (!payload.text) {
      setSpeechStatus("Nothing to read", "AccessBridge could not find readable page text. Try Screenshot / OCR.", "error");
      updateResultCard("Nothing readable found", "AccessBridge could not find enough page text to read. Try Screenshot / OCR if the content is inside an image or scan.");
      return;
    }

    pendingSpeechText = payload.text;
    pendingSpeechSourceElements = payload.sourceElements;
    pendingSpeechSourceLabel = "page text";
    startPendingSpeech();
  }

  function startPendingSpeech() {
    if (!pendingSpeechText || !pendingSpeechText.trim()) {
      startPageReadAloudFromMode();
      return;
    }

    updateResultCard(
      "Reading this page aloud",
      "AccessBridge is now reading the selected dashed sections. Words will highlight directly on the page while the audio plays."
    );

    autoMinimizeOnSpeechStart = false;
    speakText(pendingSpeechText, pendingSpeechSourceLabel, pendingSpeechSourceElements);
  }

  // backup reader for the result box if the ai voice does not work
  function readOutputAloud() {
    const output = document.getElementById("ab-output");
    const resultSourceElement = document.getElementById("ab-result-summary");
    const visibleResult = resultSourceElement?.innerText || "";

    // reads the same result the student can see first
    const text = visibleResult || output?.value || currentSummary || currentExtractedText.slice(0, 1000);

    if (!text.trim()) {
      setSpeechStatus("Nothing to read", "Generate a result, select a section, or open Reading Mode first.", "error");
      return;
    }

    speakText(text, "latest result", resultSourceElement);
  }

  function speakText(text, sourceLabel = "current result", sourceElement = null) {
    if (!text || !String(text).trim()) {
      setSpeechStatus("Nothing to read", "No readable text was found for this action.", "error");
      clearSpeechHighlight(true);
      return;
    }

    window.speechSynthesis.cancel();
    populateVoices();

    const cleanedText = String(text).trim();
    let speechStarted = false;

    setSpeechStatus("Preparing browser speech...", `Source: ${sourceLabel}. If nothing plays, choose another voice in Technical status.`, "busy");
    prepareSpeechHighlight(cleanedText, sourceLabel, sourceElement);

    currentUtterance = new SpeechSynthesisUtterance(cleanedText);
    currentUtterance.rate = Number(document.getElementById("ab-rate")?.value || 0.9);
    currentUtterance.pitch = Number(document.getElementById("ab-pitch")?.value || 1);
    currentUtterance.volume = Number(document.getElementById("ab-volume")?.value || 1);

    const selectedVoiceName = document.getElementById("ab-voice")?.value;
    const selectedVoice = availableVoices.find((voice) => voice.name === selectedVoiceName);
    if (selectedVoice) currentUtterance.voice = selectedVoice;

    currentUtterance.onstart = () => {
      speechStarted = true;
      setSpeechStatus("Speaking", `Reading ${sourceLabel}.`, "speaking");
      showSpeechMiniControls(sourceLabel, "speaking");
      updateSpeechHighlight(0);
      setLiveStatus(`Reading ${sourceLabel} aloud.`);

      if (autoMinimizeOnSpeechStart) {
        autoMinimizeOnSpeechStart = false;
        minimizePanelToBar();
      }
    };

    currentUtterance.onboundary = (event) => {
      if (typeof event.charIndex === "number") {
        updateSpeechHighlight(event.charIndex);
      }
    };

    currentUtterance.onpause = () => {
      setSpeechStatus("Paused", `Paused while reading ${sourceLabel}.`, "paused");
      showSpeechMiniControls(sourceLabel, "paused");
    };
    currentUtterance.onresume = () => {
      setSpeechStatus("Speaking", `Resumed reading ${sourceLabel}.`, "speaking");
      showSpeechMiniControls(sourceLabel, "speaking");
    };
    currentUtterance.onend = () => {
      setSpeechStatus("Finished", `Finished reading ${sourceLabel}.`, "done");
      showSpeechMiniControls(sourceLabel, "done");
      setLiveStatus("Reading aloud finished.");
      currentUtterance = null;
      scheduleSpeechHighlightClear();
      scheduleSpeechMiniControlsHide();
    };
    currentUtterance.onerror = (event) => {
      setSpeechStatus("Voice error", event.error ? `Speech failed: ${event.error}` : "Speech failed. Try choosing a different voice in Technical status.", "error");
      showSpeechMiniControls(sourceLabel, "error");
      clearSpeechHighlight(false);
      setLiveStatus("Text-to-speech had an error.");
    };

    window.setTimeout(() => {
      if (!speechStarted && currentUtterance) {
        setSpeechStatus("Still preparing audio", "If you do not hear anything, choose another voice in Technical status.", "busy");
      }
    }, 2500);

    window.speechSynthesis.speak(currentUtterance);
  }

  function setSpeechStatus(title, source, state = "idle") {
    const card = document.getElementById("ab-speech-card");
    const stateElement = document.getElementById("ab-speech-state");
    const sourceElement = document.getElementById("ab-speech-source");

    if (card) {
      card.classList.remove("ab-speech-idle", "ab-speech-ready", "ab-speech-busy", "ab-speech-speaking", "ab-speech-paused", "ab-speech-done", "ab-speech-error");
      card.classList.add(`ab-speech-${state}`);
    }

    if (stateElement) stateElement.textContent = title;
    if (sourceElement) sourceElement.textContent = source;
  }


  function prepareSpeechHighlight(text, sourceLabel, sourceElement = null) {
    speechHighlightText = String(text || "");
    speechHighlightRanges = buildSpeechWordRanges(speechHighlightText);

    if (speechHighlightClearTimer) {
      window.clearTimeout(speechHighlightClearTimer);
      speechHighlightClearTimer = null;
    }

    clearInlineSpeechHighlight();

    if (Array.isArray(sourceElement)) {
      prepareInlineSpeechHighlightForElements(sourceElement);
    } else if (sourceElement) {
      prepareInlineSpeechHighlight(sourceElement);
    }

    if (speechInlineWordSpans.length === 0) {
      setSpeechStatus(
        "Preparing voice...",
        `Source: ${sourceLabel}. Inline page highlighting is available when reading a page section, Reading Mode, or the result card.`,
        "busy"
      );
    }
  }

  function buildSpeechWordRanges(text) {
    const ranges = [];
    const matcher = /\S+/g;
    let match;

    while ((match = matcher.exec(text)) !== null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
        word: match[0]
      });
    }

    return ranges;
  }

  function prepareInlineSpeechHighlightForElements(sourceElements) {
    const elements = Array.from(sourceElements || []).filter((element) => {
      return element && element.isConnected && !element.closest("#ab-panel, #ab-reading-mode-overlay, #ab-adaptation-banner, #ab-speech-mini-controls");
    });

    elements.forEach((element) => prepareInlineSpeechHighlight(element));
  }

  function prepareInlineSpeechHighlight(sourceElement) {
    if (!sourceElement || !sourceElement.isConnected) return;

    sourceElement.classList.add("ab-speech-inline-source");

    const walker = document.createTreeWalker(
      sourceElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;

          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          if (parent.closest("script, style, textarea, input, select, button, .ab-speech-inline-word, .ab-highlight-label")) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    textNodes.forEach((node) => {
      const text = node.nodeValue;
      const fragment = document.createDocumentFragment();
      const matcher = /\S+/g;
      let lastIndex = 0;
      let match;

      while ((match = matcher.exec(text)) !== null) {
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }

        const span = document.createElement("span");
        span.className = "ab-speech-inline-word";
        span.dataset.speechWordIndex = String(speechInlineWordSpans.length);
        span.textContent = match[0];
        speechInlineWordSpans.push(span);
        fragment.appendChild(span);

        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      node.replaceWith(fragment);
    });
  }

  function updateSpeechHighlight(charIndex) {
    if (!speechHighlightText || speechHighlightRanges.length === 0 || speechInlineWordSpans.length === 0) return;

    const index = Math.max(0, Number(charIndex) || 0);
    let activeWordIndex = speechHighlightRanges.findIndex((range) => index >= range.start && index < range.end);

    if (activeWordIndex < 0) {
      activeWordIndex = speechHighlightRanges.findIndex((range) => range.start >= index);
    }

    if (activeWordIndex < 0) activeWordIndex = speechHighlightRanges.length - 1;

    const activeSpan = speechInlineWordSpans[Math.min(activeWordIndex, speechInlineWordSpans.length - 1)];
    if (!activeSpan) return;

    if (speechInlineActiveSpan && speechInlineActiveSpan !== activeSpan) {
      speechInlineActiveSpan.classList.remove("ab-speech-inline-word-active");
    }

    speechInlineActiveSpan = activeSpan;
    activeSpan.classList.add("ab-speech-inline-word-active");

    const rect = activeSpan.getBoundingClientRect();
    const isVisible = rect.top >= 80 && rect.bottom <= window.innerHeight - 80;

    if (!isVisible) {
      activeSpan.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
  }

  function scheduleSpeechHighlightClear() {
    if (speechHighlightClearTimer) window.clearTimeout(speechHighlightClearTimer);

    speechHighlightClearTimer = window.setTimeout(() => {
      clearSpeechHighlight(false);
    }, 2200);
  }

  function clearInlineSpeechHighlight() {
    const previousParents = new Set();

    speechInlineWordSpans.forEach((span) => {
      if (!span || !span.parentNode) return;

      const parent = span.parentNode;
      previousParents.add(parent);
      span.replaceWith(document.createTextNode(span.textContent || ""));
    });

    previousParents.forEach((parent) => {
      if (parent && typeof parent.normalize === "function") parent.normalize();
    });

    document.querySelectorAll(".ab-speech-inline-source").forEach((element) => {
      element.classList.remove("ab-speech-inline-source");
    });

    speechInlineWordSpans = [];
    speechInlineActiveSpan = null;
  }

  function clearSpeechHighlight(remove = false) {
    if (speechHighlightClearTimer) {
      window.clearTimeout(speechHighlightClearTimer);
      speechHighlightClearTimer = null;
    }

    speechHighlightRanges = [];
    speechHighlightText = "";
    clearInlineSpeechHighlight();

    const oldFloatingBox = document.getElementById("ab-speech-word-highlight");
    if (oldFloatingBox) oldFloatingBox.remove();
  }

  function testVoice() {
    speakText("AccessBridge browser fallback voice test. If you can hear this, the backup read aloud option is working.", "browser fallback voice test");
  }

  function showSpeechMiniControls(sourceLabel = "page text", state = "speaking") {
    if (speechMiniRemoveTimer) {
      window.clearTimeout(speechMiniRemoveTimer);
      speechMiniRemoveTimer = null;
    }

    let mini = document.getElementById("ab-speech-mini-controls");
    if (!mini) {
      mini = document.createElement("div");
      mini.id = "ab-speech-mini-controls";
      mini.setAttribute("role", "region");
      mini.setAttribute("aria-label", "AccessBridge audio controls");
      mini.innerHTML = `
        <div class="ab-mini-audio-text">
          <strong id="ab-mini-audio-state">Reading</strong>
          <span id="ab-mini-audio-source">AccessBridge audio</span>
        </div>
        <div class="ab-mini-audio-actions">
          <button id="ab-mini-pause" type="button">Pause</button>
          <button id="ab-mini-resume" type="button">Play</button>
        </div>
      `;

      document.body.appendChild(mini);
      document.getElementById("ab-mini-pause")?.addEventListener("click", (event) => {
        event.stopPropagation();
        pauseReading();
      });
      document.getElementById("ab-mini-resume")?.addEventListener("click", (event) => {
        event.stopPropagation();
        resumeReading();
      });
    }

    mini.classList.remove("ab-mini-ready", "ab-mini-speaking", "ab-mini-paused", "ab-mini-done", "ab-mini-error");
    mini.classList.add(`ab-mini-${state}`);

    const stateText = document.getElementById("ab-mini-audio-state");
    const sourceText = document.getElementById("ab-mini-audio-source");
    if (stateText) {
      stateText.textContent =
        state === "ready" ? "Ready" :
        state === "paused" ? "Paused" :
        state === "done" ? "Finished" :
        state === "error" ? "Audio issue" :
        "Reading";
    }
    if (sourceText) {
      sourceText.textContent = state === "ready" ? `Click a dashed box or press Play · ${sourceLabel}` : `Source: ${sourceLabel}`;
    }
  }

  function scheduleSpeechMiniControlsHide() {
    if (speechMiniRemoveTimer) window.clearTimeout(speechMiniRemoveTimer);
    speechMiniRemoveTimer = window.setTimeout(() => hideSpeechMiniControls(false), 2600);
  }

  function hideSpeechMiniControls(immediate = false) {
    if (speechMiniRemoveTimer) {
      window.clearTimeout(speechMiniRemoveTimer);
      speechMiniRemoveTimer = null;
    }

    const mini = document.getElementById("ab-speech-mini-controls");
    if (!mini) return;

    if (immediate) {
      mini.remove();
      return;
    }

    mini.classList.add("ab-mini-hiding");
    window.setTimeout(() => mini.remove(), 180);
  }

  function pauseReading() {
    if (naturalVoiceAudio && !naturalVoiceAudio.paused) {
      naturalVoiceAudio.pause();
      return;
    }

    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      setSpeechStatus("Paused", "Browser speech fallback is paused. Press Play to continue.", "paused");
      showSpeechMiniControls("current reading", "paused");
      setLiveStatus("Reading paused.");
    }
  }

  function resumeReading() {
    if (naturalVoiceAudio && naturalVoiceAudio.paused) {
      naturalVoiceAudio.play().then(() => {
        setNaturalVoiceStatus("AI natural voice resumed.", "success");
        setSpeechStatus("AI voice playing", "AI natural voice resumed.", "speaking");
        setLiveStatus("AI natural voice resumed.");
      }).catch((error) => {
        console.error("Could not resume AI natural voice:", error);
        const resultSourceElement = document.getElementById("ab-result-summary");
        startResultBrowserFallback(pendingSpeechText || getNaturalVoiceText(), resultSourceElement, "AI natural voice could not resume");
      });
      return;
    }

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setSpeechStatus("Browser fallback speaking", "Browser speech resumed.", "speaking");
      showSpeechMiniControls("current reading", "speaking");
      setLiveStatus("Reading resumed.");
      return;
    }

    if (!window.speechSynthesis.speaking && pendingSpeechText && pendingSpeechText.trim()) {
      startPendingSpeech();
      return;
    }

    if (!window.speechSynthesis.speaking) {
      startPageReadAloudFromMode();
    }
  }

  function stopReading() {
    stopNaturalVoiceAudio(false);
    autoMinimizeOnSpeechStart = false;
    window.speechSynthesis.cancel();
    currentUtterance = null;
    clearSpeechHighlight(false);
    hideSpeechMiniControls(true);
    setSpeechStatus("Stopped", "Audio playback stopped.", "idle");
    setLiveStatus("Reading stopped.");
  }

  function populateVoices() {
    const voiceSelect = document.getElementById("ab-voice");
    if (!voiceSelect) return;

    availableVoices = window.speechSynthesis.getVoices();

    const currentValue = voiceSelect.value;
    voiceSelect.innerHTML = `<option value="">Default voice</option>` +
      availableVoices
        .map((voice) => `<option value="${escapeHTML(voice.name)}">${escapeHTML(voice.name)} ${voice.lang ? `(${escapeHTML(voice.lang)})` : ""}</option>`)
        .join("\n");

    voiceSelect.value = currentValue;
    if (!voiceSelect.value && availableVoices.length > 0) {
      const preferred = availableVoices.find((voice) => /english|en-/i.test(`${voice.name} ${voice.lang}`));
      if (preferred) voiceSelect.value = preferred.name;
    }
  }

  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = populateVoices;
  }

  function updateSliderLabels() {
    const rate = document.getElementById("ab-rate");
    const pitch = document.getElementById("ab-pitch");
    const volume = document.getElementById("ab-volume");

    if (rate) document.getElementById("ab-rate-value").textContent = `${Number(rate.value).toFixed(1)}x`;
    if (pitch) document.getElementById("ab-pitch-value").textContent = Number(pitch.value).toFixed(1);
    if (volume) document.getElementById("ab-volume-value").textContent = `${Math.round(Number(volume.value) * 100)}%`;
  }

  // creates A copyable accessibility barrier report for sending it to an department or web page designer for a report for it to be fix
  //(might get rid of it not sure yet)
  function generateBarrierReport() {
    const output = document.getElementById("ab-output");
    const score = calculateAccessibilityScore(currentIssues);
    const recommendedNextStep = getRecommendedNextStep(currentIssues, currentExtractedText);
    const type = document.getElementById("ab-report-type")?.value || "student";

    const issueText =
      currentIssues.length === 0
        ? "No obvious issues were detected by the scan."
        : currentIssues.map((i) => `- ${i.severity}: ${i.type} — ${i.message}`).join("\n");

    const technicalText = currentIssues.length === 0
      ? "No detected technical issues."
      : currentIssues.map((i) => `- type=${i.type}; severity=${i.severity}; count=${i.count || 1}; suggestedFix=${getSuggestedFix(i.type)}`).join("\n");

    const reports = {
      student: `Accessibility Barrier Report — Student Version

I am having trouble accessing this page and used AccessBridge to create a student-friendly summary of possible barriers.

Page title:
${document.title}

Page URL:
${location.href}

AccessBridge Score:
${score}/100

Recommended next step:
${recommendedNextStep.title} — ${recommendedNextStep.message}

Possible barriers found:
${issueText}

What I may need:
An accessible version, simpler instructions, captions/transcript, image descriptions, or help completing any inaccessible forms.

Generated by AccessBridge.`,
      professor: `Subject: Possible accessibility barrier on course page

Hello Professor,

I am using AccessBridge to review a course page that may be difficult to access. The page appears to have possible accessibility barriers that could make it harder to use with screen readers, text-to-speech, captions, OCR tools, keyboard navigation, or reading support tools.

Page:
${location.href}

Possible barriers:
${issueText}

Could an accessible version, alternate explanation, or clarification be provided if needed?

Thank you.`,
      "sas-it": `Subject: Possible digital accessibility barrier

Hello,

AccessBridge detected possible accessibility barriers on this page. This is not an official compliance audit, but the page may need review for student access.

Page title:
${document.title}

Page URL:
${location.href}

AccessBridge Score:
${score}/100

Detected issues:
${issueText}

Student impact:
${generateStudentImpactBullets(currentIssues).join("\n")}

Suggested next step:
Please review this page or material and provide an accessible version if needed.

Generated by AccessBridge.`,
      technical: `Technical Accessibility Scan Report

Page title: ${document.title}
Page URL: ${location.href}
AccessBridge Score: ${score}/100

Detected issues:
${technicalText}

Barrier map:
${currentBarrierMap.map((entry) => `- ${entry.index}. ${entry.label}; ${entry.location}; fix=${entry.fix}`).join("\n") || "No jumpable barriers found."}

Note:
This is an automated student-support scan, not a full WCAG audit.`,
      facilities: `Subject: Possible campus access information barrier

Hello,

I am reviewing a campus or student support page that may be difficult to access or understand. AccessBridge found possible barriers that could affect students looking for accessibility, elevator, ramp, route, or accommodation information.

Page:
${location.href}

Possible barriers:
${issueText}

Requested support:
Please review whether this page clearly explains accessible entrances, ramps, elevators, closures, contact information, or alternate access options.

Generated by AccessBridge.`
    };

    setOutputValue(reports[type] || reports.student);
    output.focus();
  }

  function exportReportJson() {
    const score = calculateAccessibilityScore(currentIssues);
    const payload = {
      generatedBy: "AccessBridge",
      title: document.title,
      url: location.href,
      score,
      issues: currentIssues,
      barrierMap: currentBarrierMap.map((entry) => ({
        index: entry.index,
        type: entry.type,
        severity: entry.severity,
        label: entry.label,
        location: entry.location,
        suggestedFix: entry.fix
      })),
      recommendedNextStep: getRecommendedNextStep(currentIssues, currentExtractedText),
      generatedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "accessbridge-report.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  // asks questions about the page by sending only the parts that seem related
  async function askPageQuestion() {
    const questionInput = document.getElementById("ab-question");
    const question = questionInput?.value?.trim();

    if (!question) {
      setOutputValue("Type a question first. Example: What forms do I need?");
      return;
    }

    if (!currentExtractedText || currentExtractedText.trim().length < 80) {
      currentExtractedText = extractPageText();
    }

    if (!currentIssues.length) {
      currentIssues = scanAccessibilityIssues();
    }

    if (!currentPageSections.length) {
      currentBarrierMap = currentBarrierMap.length ? currentBarrierMap : buildBarrierMapEntries();
      currentPageSections = buildPageSections();
    }

    const askContext = buildAskPageQuestionContext(question);
    const stopLoading = setButtonLoading("ab-ask", "Finding answer...");
    setOutputValue(`Question:\n${question}\n\nSearching the most relevant parts of this page...`);

    try {
      const result = await askPageBackend({
        question,
        text: askContext.text,
        snippets: askContext.snippets,
        pageTitle: document.title || "Current page",
        pageUrl: location.href,
        issues: currentIssues
      });

      const answer = result?.answer || result?.summary || "I could not find a clear answer on this page.";
      setOutputValue(answer, "Answer from this page");
      currentSummary = answer;
    } catch (error) {
      const answer = answerQuestionLocally(question, currentExtractedText, askContext);
      setOutputValue("AI answer unavailable, so AccessBridge searched the page locally.\n\n" + answer, "Local page answer");
      currentSummary = answer;
      console.error(error);
    } finally {
      stopLoading();
      document.getElementById("ab-result-card")?.focus?.();
    }
  }

  // pulls the important words out of the question so it can search the page better
  function getAskQuestionKeywords(question) {
    const stopWords = new Set([
      "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
      "this", "that", "these", "those", "page", "about", "with", "from", "into",
      "need", "needs", "does", "do", "did", "can", "could", "would", "should",
      "have", "has", "had", "are", "is", "was", "were", "the", "and", "for", "you",
      "your", "student", "students", "please", "tell", "explain", "simply"
    ]);

    const words = String(question || "")
      .toLowerCase()
      .split(/\W+/)
      .map((word) => word.trim())
      .filter((word) => word.length > 2 && !stopWords.has(word));

    if (/deadline|due|date|when|schedule|time/i.test(question)) words.push("deadline", "due", "date", "submit");
    if (/form|paperwork|document|submit|upload|application/i.test(question)) words.push("form", "submit", "required", "document");
    if (/contact|email|phone|office|call|reach/i.test(question)) words.push("contact", "email", "phone", "office");
    if (/next|do|steps|required|need/i.test(question)) words.push("required", "steps", "must", "need");

    return Array.from(new Set(words));
  }

  // gives page text a score based on if it matches the question
  function scoreAskText(text, keywords) {
    const lower = String(text || "").toLowerCase();
    let score = 0;

    keywords.forEach((keyword) => {
      if (lower.includes(keyword)) score += 3;
    });

    if (/deadline|due date|submit by|no later than|before|after/i.test(lower)) score += 2;
    if (/form|application|request|documentation|upload|submit|required/i.test(lower)) score += 2;
    if (/contact|email|phone|office|advisor|coordinator|accessibility|accommodation/i.test(lower)) score += 2;
    if (/next step|steps|must|should|need to|required to/i.test(lower)) score += 2;

    return score;
  }

  // builds the smaller context for ask this page so the ai does not read random extra stuff
  function buildAskPageQuestionContext(question) {
    const keywords = getAskQuestionKeywords(question);
    const sectionCandidates = (currentPageSections || [])
      .map((section, index) => ({
        title: section.title || `Section ${index + 1}`,
        text: String(section.text || "").replace(/\s+/g, " ").trim(),
        score: scoreAskText(`${section.title || ""} ${section.text || ""}`, keywords)
      }))
      .filter((section) => section.text.length > 0)
      .sort((a, b) => b.score - a.score);

    let snippets = sectionCandidates
      .filter((section) => section.score > 0)
      .slice(0, 4);

    if (snippets.length === 0) {
      const sentences = String(currentExtractedText || "")
        .replace(/\s+/g, " ")
        .split(/(?<=[.!?])\s+/)
        .filter(Boolean)
        .map((sentence) => ({
          title: "Readable page text",
          text: sentence.trim(),
          score: scoreAskText(sentence, keywords)
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);

      snippets = sentences;
    }

    const contextText = snippets.length > 0
      ? snippets.map((snippet, index) => `Source ${index + 1} — ${snippet.title}:\n${snippet.text.slice(0, 1400)}`).join("\n\n")
      : String(currentExtractedText || "").slice(0, 5000);

    return {
      text: contextText,
      snippets: snippets.map((snippet, index) => ({
        index: index + 1,
        title: snippet.title,
        text: snippet.text.slice(0, 1400),
        score: snippet.score
      }))
    };
  }

  // backup answer if the backend does not respond
  function answerQuestionLocally(question, text, context = null) {
    const snippets = Array.isArray(context?.snippets) && context.snippets.length > 0
      ? context.snippets
      : buildAskPageQuestionContext(question).snippets;

    if (snippets.length === 0) {
      return [
        `Answer:\nI could not find that answer in the readable text on this page.`,
        `Found on this page:\nNo matching section was found.`,
        `Next step:\nTry Screenshot / OCR if the answer may be inside an image, scanned PDF, chart, or screenshot. If this is about accommodations, contact the office listed on the page before assuming a deadline or requirement.`
      ].join("\n\n");
    }

    const best = snippets[0];
    const supportingLines = snippets
      .slice(0, 3)
      .map((snippet) => `- ${snippet.text.replace(/\s+/g, " ").slice(0, 240)}${snippet.text.length > 240 ? "..." : ""}`)
      .join("\n");

    return [
      `Answer:\nI found page text that may answer your question. The most relevant part is under “${best.title}.”`,
      `Found on this page:\n${supportingLines}`,
      `Next step:\nUse the section above as your starting point. If the page links to a form, PDF, or portal, open that next because AccessBridge can only answer from text it can read on this page.`
    ].join("\n\n");
  }

  function applyStudentPreset() {
    const profile = getSelectedProfile();
    updateModeDescription(profile.id);
    setLiveStatus(`${profile.name} selected.`);
  }

  async function copyReportType(type) {
    const reportType = document.getElementById("ab-report-type");
    if (reportType) reportType.value = type;

    generateBarrierReport();

    const output = document.getElementById("ab-output");
    if (!output || !output.value.trim()) {
      showAccessBridgeNotification("Nothing to copy yet.", "warning");
      setLiveStatus("Nothing to copy yet.");
      return;
    }

    const successMessage = type === "professor" ? "Professor email copied." : "SAS or IT draft copied.";

    try {
      await navigator.clipboard.writeText(output.value);
      showAccessBridgeNotification(successMessage, "success");
      setLiveStatus(successMessage);
    } catch (error) {
      console.error("Copy report failed:", error);
      const copiedWithFallback = fallbackCopyFromOutput(output);
      showAccessBridgeNotification(
        copiedWithFallback ? successMessage : "Copy failed. Select the text and copy it manually.",
        copiedWithFallback ? "success" : "error"
      );
      setLiveStatus(copiedWithFallback ? successMessage : "Copy failed. Select the text and copy it manually.");
    }
  }

  // copies the output into your clipboard (idea came from a friend)
  async function copyOutput() {
    const output = document.getElementById("ab-output");

    if (!output || !output.value.trim()) {
      showAccessBridgeNotification("Nothing to copy yet. Generate a result first.", "warning");
      setLiveStatus("Nothing to copy yet. Generate a result first.");
      return;
    }

    try {
      await navigator.clipboard.writeText(output.value);
      showAccessBridgeNotification("Copied to clipboard.", "success");
      setLiveStatus("Copied to clipboard.");
    } catch (error) {
      console.error("Copy failed:", error);
      const copiedWithFallback = fallbackCopyFromOutput(output);
      showAccessBridgeNotification(
        copiedWithFallback ? "Copied to clipboard." : "Copy failed. Select the text and copy it manually.",
        copiedWithFallback ? "success" : "error"
      );
      setLiveStatus(copiedWithFallback ? "Copied to clipboard." : "Copy failed. Select the text and copy it manually.");
    }
  }

  function fallbackCopyFromOutput(output) {
    if (!output) return false;

    try {
      output.focus();
      output.select();
      return document.execCommand("copy");
    } catch (error) {
      console.error("Fallback copy failed:", error);
      return false;
    }
  }
  
  // captures the image on the page and sends it to the back end for the OCR 
  async function analyzeVisibleScreenshot() {
    const output = document.getElementById("ab-output");
    const stopLoading = setButtonLoading("ab-image", "Analyzing screenshot...");
    setLiveStatus("Capturing screenshot for OCR and image explanation.");
    setOutputValue("Capturing screenshot and analyzing visible content...");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "ANALYZE_VISIBLE_SCREENSHOT"
      });

      if (!response || !response.ok) {
        throw new Error(response?.error || "Image analysis failed");
      }

      currentSummary = response.data.analysis;
      setOutputValue(currentSummary);
    } catch (error) {
      console.error(error);
      setOutputValue("Could not analyze the screenshot. Make sure the backend is running and your API key supports image input. The page scan and local fallback still work.");
    } finally {
      stopLoading();
      document.getElementById("ab-result-card")?.focus?.();
    }
  }

  // one button for page markers click once to show click again to clear
  function togglePageMarkers() {
    if (pageMarkersVisible) {
      clearHighlights();
      setOutputValue("Page markers cleared.");
      return;
    }

    const count = highlightBarriers(true);

    if (count === 0) {
      setOutputValue("No highlightable barriers were found on this page by the scan.");
    } else {
      setOutputValue(`Highlighted ${count} possible accessibility barrier(s) on the page. Click Show page markers again to clear them.`);
    }
  }

  // changes the marker button text depending on if marks are showing
  function updatePageMarkerButton() {
    const button = document.getElementById("ab-highlight");
    if (!button) return;

    const title = button.querySelector(".ab-button-title");
    const subtitle = button.querySelector(".ab-button-subtitle");

    button.setAttribute("aria-pressed", String(pageMarkersVisible));
    button.classList.toggle("ab-button-success", pageMarkersVisible);

    if (title) title.textContent = pageMarkersVisible ? "Clear page markers" : "Show page markers";
    if (subtitle) {
      subtitle.textContent = pageMarkersVisible
        ? "Remove the highlighted issue markers from the page"
        : "Highlight possible issues on the page until you click again";
    }
  }

  function highlightBarriers(silent = false) {
    clearHighlights({ preserveButtonState: true });
    currentBarrierMap = buildBarrierMapEntries();

    let count = 0;
    currentBarrierMap.slice(0, 30).forEach((entry) => {
      markElement(entry.element, entry.label);
      count++;
    });

    pageMarkersVisible = count > 0;
    updatePageMarkerButton();

    if (!silent) {
      if (count === 0) {
        setOutputValue("No highlightable barriers were found on this page by the scan.");
      } else {
        setOutputValue(`Highlighted ${count} possible accessibility barrier(s) on the page. Click Show page markers again to clear them.`);
      }
    }

    return count;
  }

  function markElement(element, labelText) {
    if (!element || element.closest("#ab-panel") || element.closest("#ab-reading-mode-overlay")) return;

    element.classList.add("ab-highlighted-barrier");

    const label = document.createElement("div");
    label.className = "ab-highlight-label";
    label.textContent = `AccessBridge: ${labelText}`;

    element.insertAdjacentElement("beforebegin", label);
  }

  function clearHighlights(options = {}) {
    document.querySelectorAll(".ab-highlighted-barrier").forEach((element) => {
      element.classList.remove("ab-highlighted-barrier");
      delete element.dataset.abBarrierId;
    });

    document.querySelectorAll(".ab-highlight-label").forEach((label) => {
      label.remove();
    });

    if (!options.preserveButtonState) {
      pageMarkersVisible = false;
      updatePageMarkerButton();
    }
  }

  function jumpToBarrier(id) {
    const entry = currentBarrierMap.find((item) => item.id === id);
    if (!entry || !entry.element) return;

    clearHighlights();
    markElement(entry.element, entry.label);
    entry.element.scrollIntoView({ behavior: "smooth", block: "center" });

    if (typeof entry.element.focus === "function") {
      entry.element.setAttribute("tabindex", entry.element.getAttribute("tabindex") || "-1");
      entry.element.focus({ preventScroll: true });
    }

    setOutputValue(`Jumped to barrier:\n${entry.label}\n\nWhy it matters:\n${entry.type}\n\nSuggested fix:\n${entry.fix}`);
  }

  function openReadingMode() {
    const existing = document.getElementById("ab-reading-mode-overlay");
    if (existing) existing.remove();

    const text = document.getElementById("ab-result-summary")?.innerText || document.getElementById("ab-output")?.value || currentSummary || generateFallbackSummary(currentExtractedText);
    const panel = document.getElementById("ab-panel");
    if (panel) {
      panel.classList.add("ab-panel-hidden-while-reading");
      panel.setAttribute("aria-hidden", "true");
    }

    const reading = document.createElement("div");
    reading.id = "ab-reading-mode-overlay";
    reading.setAttribute("role", "dialog");
    reading.setAttribute("aria-modal", "true");
    reading.setAttribute("aria-label", "AccessBridge reading mode");
    reading.innerHTML = `
      <div class="ab-reading-shell">
        <div class="ab-reading-header">
          <div>
            <span class="ab-eyebrow">Reading Mode</span>
            <h1>${escapeHTML(document.title || "Page content")}</h1>
          </div>
          <button id="ab-close-reading" class="ab-icon-button" aria-label="Close reading mode">×</button>
        </div>
        <p class="ab-reading-intro">Reading Mode is the active surface now. The main AccessBridge panel is hidden so this view can stay focused.</p>
        <div class="ab-reading-controls">
          <button id="ab-reading-read" class="ab-small-button">Read this view</button>
          <button id="ab-reading-stop" class="ab-small-button ab-danger-button">Stop</button>
          <button id="ab-reading-contrast" class="ab-small-button">High contrast</button>
          <button id="ab-reading-line-focus" class="ab-small-button">Line focus</button>
        </div>
        <pre id="ab-reading-text">${escapeHTML(text)}</pre>
      </div>
    `;

    document.body.appendChild(reading);

    function closeReadingMode() {
      reading.remove();
      const existingPanel = document.getElementById("ab-panel");
      if (existingPanel) {
        existingPanel.classList.remove("ab-panel-hidden-while-reading");
        existingPanel.removeAttribute("aria-hidden");
        document.getElementById("ab-reading-mode")?.focus();
      }
    }

    document.getElementById("ab-close-reading").addEventListener("click", closeReadingMode);
    document.getElementById("ab-reading-read").addEventListener("click", () => {
      const readingText = document.getElementById("ab-reading-text").innerText;
      const panelOutput = document.getElementById("ab-output");
      if (panelOutput) panelOutput.value = readingText;
      speakText(readingText, "Reading Mode", document.getElementById("ab-reading-text"));
    });
    document.getElementById("ab-reading-stop").addEventListener("click", stopReading);
    document.getElementById("ab-reading-contrast").addEventListener("click", () => reading.classList.toggle("ab-reading-high-contrast"));
    document.getElementById("ab-reading-line-focus").addEventListener("click", () => reading.classList.toggle("ab-reading-line-focus"));
    reading.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeReadingMode();
        return;
      }

      trapFocusInElement(reading, event);
    });

    document.getElementById("ab-close-reading").focus();
  }

  function setProgressState(step, message) {
    const title = document.getElementById("ab-progress-title");
    const card = document.getElementById("ab-progress-card");

    if (title) title.textContent = message;
    if (card) {
      card.hidden = step === 0;
      card.classList.toggle("ab-progress-active", step > 0 && step < 4);
    }

    for (let i = 1; i <= 4; i++) {
      const element = document.getElementById(`ab-progress-step-${i}`);
      if (!element) continue;

      element.classList.toggle("ab-progress-step-active", i === step);
      element.classList.toggle("ab-progress-step-complete", i < step || step === 4);
    }
  }

  function setOutputValue(value, title = "Latest output") {
    const output = document.getElementById("ab-output");
    if (!output) return;

    output.value = value;
    updateResultCard(title, value);

    try {
      sessionStorage.setItem(getLastOutputKey(), value);
    } catch (error) {
      console.error("Could not save last output:", error);
    }
  }

  function updateResultCard(title, value) {
    const card = document.getElementById("ab-result-card");
    const titleElement = document.getElementById("ab-result-title");
    const summaryElement = document.getElementById("ab-result-summary");

    if (!card || !titleElement || !summaryElement) return;

    const cleaned = String(value || "").trim();

    if (!cleaned) {
      titleElement.textContent = "Ready to adapt this page";
      summaryElement.textContent = "Choose a support mode, then press Adapt this page for me.";
      return;
    }

    card.hidden = false;
    titleElement.textContent = title;
    summaryElement.innerHTML = buildStructuredResultHTML(cleaned);
  }

  function buildStructuredResultHTML(text) {
    const cleaned = String(text || "").trim();
    const lines = cleaned.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const chunks = [];
    let currentTitle = "What this page is about";
    let currentItems = [];

    const pushChunk = () => {
      if (currentItems.length === 0) return;
      chunks.push({ title: currentTitle, items: currentItems.slice(0, 6) });
      currentItems = [];
    };

    lines.slice(0, 45).forEach((line) => {
      const heading = line.match(/^([A-Z][A-Za-z\s\/]+):$/) || line.match(/^(Summary|Student-friendly result|Recommended next step|What you can do next|Top reasons this page may need support|Focus checklist):/i);
      if (heading && line.length < 80) {
        pushChunk();
        currentTitle = line.replace(/:$/, "");
      } else {
        currentItems.push(line.replace(/^[-•]\s*/, ""));
      }
    });
    pushChunk();

    if (chunks.length === 0) {
      return `<p>${escapeHTML(createResultPreview(cleaned))}</p>`;
    }

    return chunks.slice(0, 4).map((chunk) => `
      <div class="ab-result-chunk">
        <strong>${escapeHTML(chunk.title)}</strong>
        <ul>
          ${chunk.items.slice(0, 4).map((item) => `<li>${escapeHTML(item)}</li>`).join("")}
        </ul>
      </div>
    `).join("");
  }

  function createResultPreview(text) {
    const withoutHeadings = text
      .replace(/^AccessBridge Adaptation Results\s*/i, "")
      .replace(/^Summary:\s*/i, "")
      .trim();

    return withoutHeadings.length > 260 ? withoutHeadings.slice(0, 260) + "..." : withoutHeadings;
  }

  function restoreLastOutput() {
    // keeping this off for the demo because old saved results made the page feel wrong
  }

  function getLastOutputKey() {
    return `accessbridge:lastOutput:${location.href}`;
  }

  function setLiveStatus(message) {
    const liveStatus = document.getElementById("ab-live-status");
    if (liveStatus) liveStatus.textContent = message;
  }

  function showAccessBridgeNotification(message, tone = "success") {
    const existing = document.getElementById("ab-toast-notification");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "ab-toast-notification";
    toast.className = `ab-toast-notification ab-toast-${tone}`;
    toast.setAttribute("role", tone === "error" ? "alert" : "status");
    toast.setAttribute("aria-live", tone === "error" ? "assertive" : "polite");
    toast.textContent = message;

    document.body.appendChild(toast);

    window.clearTimeout(showAccessBridgeNotification.timer);
    showAccessBridgeNotification.timer = window.setTimeout(() => {
      toast.classList.add("ab-toast-hiding");
      window.setTimeout(() => toast.remove(), 180);
    }, 2200);
  }

  function loadPreferences() {
    if (!chrome?.storage?.local) return;

    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const prefs = result?.[STORAGE_KEY] || {};

      // dont auto pick a mode when the panel opens it should look fresh until the user clicks one

      if (prefs.rate && document.getElementById("ab-rate")) document.getElementById("ab-rate").value = prefs.rate;
      if (prefs.pitch && document.getElementById("ab-pitch")) document.getElementById("ab-pitch").value = prefs.pitch;
      if (prefs.volume && document.getElementById("ab-volume")) document.getElementById("ab-volume").value = prefs.volume;
      if (prefs.voice && document.getElementById("ab-voice")) document.getElementById("ab-voice").value = prefs.voice;

      updateSliderLabels();
    });
  }

  function savePreferences() {
    if (!chrome?.storage?.local) return;

    const prefs = {
      profile: document.getElementById("ab-profile")?.value || "reading",
      voice: document.getElementById("ab-voice")?.value || "",
      rate: document.getElementById("ab-rate")?.value || "0.9",
      pitch: document.getElementById("ab-pitch")?.value || "1",
      volume: document.getElementById("ab-volume")?.value || "1"
    };

    chrome.storage.local.set({ [STORAGE_KEY]: prefs });
  }

  function withTimeout(promise, ms, message) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error(message || "Request timed out.")), ms);
    });

    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
  }

  function trapFocusInElement(container, event) {
    if (event.key !== "Tab") return;

    const focusable = Array.from(container.querySelectorAll("button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])"))
      .filter((element) => !element.disabled && element.offsetParent !== null);

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function escapeHTML(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
