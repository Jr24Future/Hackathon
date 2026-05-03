# AccessBridge

AccessBridge is a browser extension project created for the ISU 2026 Hackathon, where the theme is accessibility for students.

The idea behind AccessBridge came from a real problem: many students depend on websites, course pages, online forms, PDFs, maps, and school resources that are not always built with accessibility in mind. Some pages may have missing alt text, no captions, confusing layouts, dense wording, scanned text, or outdated information about accessible routes like elevators, ramps, and entrances.

AccessBridge is meant to act as a digital bridge for students when the systems around them are not fully accessible yet.

It is not meant to replace Student Accessibility Services, screen readers, professors, or proper accessible design. It is meant to give students help in the moment when a page is hard to use.

---

## Core Idea

AccessBridge helps students better understand and interact with web content by giving them a simple accessibility support tool directly in the browser.

With one button or keyboard shortcut, the extension can scan the page, pull out readable content, summarize it, simplify it, read it aloud, and help separate the page into clearer sections. It can also point out possible accessibility barriers on the page, such as missing image descriptions, unclear structure, dense text, unlabeled fields, or visual content that may be hard to understand.

The goal is not to replace official accommodations or proper accessible design. The goal is to support students in the moment while also showing where accessibility gaps may exist.

The current version is more than just a scanner. It is designed to adapt a page into something easier to read, hear, navigate, and understand.

---

## Why Have I Built This

Students can run into accessibility barriers in many places, including:

- course websites
- school portals
- PDFs and online documents
- campus resource pages
- building accessibility pages
- forms and registration systems
- pages with images, charts, or scanned text
- pages that are visually cluttered or hard to read
- pages with important information buried in long paragraphs
- old pages that were not designed with modern accessibility in mind

For students with low vision, dyslexia, ADHD, reading difficulties, cognitive accessibility needs, or students who rely on text-to-speech, these issues can make basic school tasks harder than they should be.

AccessBridge was created around the idea that accessibility should not depend on whether a website is perfectly designed. When a page is hard to access, students should still have a way to get the information they need.

---

## Main Features

AccessBridge includes several core features.

### Page Adaptation

The main action in AccessBridge is:

```text
Make this page easier to understand and read
```

This takes the current page and creates a more student-friendly version of the important information. The goal is to quickly answer:

- What is this page about?
- What matters most?
- What does the student need to do next?
- Are there any possible barriers that make the page harder to use?

AccessBridge first does a local scan and page parse, then improves the result with AI when available.

### Support Modes

AccessBridge has four main support modes:

```text
Understand what's happening
Text to speech
Find what's important
Separate sections clearly
```

Each mode changes how AccessBridge helps the student.

#### Understand what's happening

This mode focuses on making the page easier to understand. It highlights readable parts of the page and helps create a plain-language explanation.

#### Text to speech

This mode focuses on listening. It marks areas that may be useful for audio support and lets the student read text aloud using browser text-to-speech or the natural voice option.

#### Find what's important

This mode focuses on important student tasks. It looks for things like deadlines, forms, steps, requirements, contact information, and action items.

#### Separate sections clearly

This mode helps organize the page visually. It separates sections so the student can better understand where one part of the page ends and another begins.

### Page Summary

The extension extracts readable text from the current webpage and creates a short, clear summary. This helps students quickly understand what the page is about without having to read through dense or confusing content.

### Simplified Language

AccessBridge can rewrite page content in simpler language. This is useful for students who struggle with complicated wording, long paragraphs, or information overload.

### Read Aloud

The extension can read the summary, simplified version, or selected section out loud using browser text-to-speech. This supports students who prefer listening, have difficulty reading, or need audio support while studying.

The browser text-to-speech option also supports word-level highlighting while reading, so the student can follow along visually.

### Natural Voice

AccessBridge also includes an optional natural voice feature.

This uses OpenAI text-to-speech through the backend to create a better sounding voice than the default browser voices. The natural voice is AI-generated and is meant to sound calmer and less robotic.

The regular browser text-to-speech is still kept as a fallback because it is faster, works locally in the browser, and supports word highlighting.

### Screenshot / OCR and Image Explanation

Some school pages have important content trapped inside images, screenshots, charts, or scanned-looking material.

AccessBridge can capture the visible screen and send it to the backend for image explanation when a vision model is available. This can help students understand visual information that may not be accessible through normal page text.

### Ask This Page

Students can ask questions about the current page, such as:

```text
What is the deadline?
What forms do I need?
Who do I contact?
What are the next steps?
```

AccessBridge answers using the extracted page text, so the student does not need to search through the whole page manually.

### Page Sections

AccessBridge can parse the page into sections and let the student jump to different parts of the page.

This is useful when a page is long, cluttered, or hard to scan. Instead of only listing technical issues, AccessBridge tries to help the student move around the page more easily.

### Reading Mode

AccessBridge includes a reading view that opens a cleaner version of the content. This is meant to reduce clutter and make the page easier to read.

Reading Mode can help with:

- larger text
- better spacing
- cleaner layout
- reduced visual clutter
- focused reading

### Low Vision / Display Adjuster

The project includes a display and tone adjustment tool for low-vision support. This can help students adjust the visual style of the page so it is easier to see.

This includes support for changes like:

- text size
- line spacing
- contrast themes
- underlined links
- bold text
- reduced motion
- clearer focus indicators

### Accessibility Scan

AccessBridge checks the page for possible accessibility barriers, such as:

- images missing alt text
- empty alt text
- very long paragraphs
- weak or missing heading structure
- skipped heading levels
- videos that may not have captions
- forms that may not have proper labels
- vague links
- unnamed buttons
- iframes without titles
- tables without captions or headers
- pages with very little readable text

These checks are not meant to be official accessibility audits. They are meant to help identify possible problems that may affect students.

### Barrier Report Generator

The extension can generate an accessibility barrier report. A student could use this report to explain a problem to Student Accessibility Services, IT, a professor, or another support office.

For example, if a page has images without alt text, scanned content that cannot be read properly, or forms that are hard to use, AccessBridge can help describe the issue in a clear way.

---

## How It Works

AccessBridge is designed to work directly in the browser.

The basic flow is:

1. A student opens a webpage.
2. The student clicks the AccessBridge extension or presses `Alt + X`.
3. AccessBridge opens a small panel on the page.
4. The student chooses what kind of help they need.
5. AccessBridge scans and parses the page.
6. The student can adapt the page, read content aloud, ask questions, open reading mode, or review possible barriers.
7. The student can generate a report if they need to explain the problem to someone else.

The extension is designed to be simple and quick. The student does not need to copy and paste text manually or switch to a different app.

---

## Keyboard Shortcut

AccessBridge opens with:

```text
Alt + X
```

The shortcut is meant to make the tool fast to access during a real student workflow.

In the current version, pressing the shortcut can open the extension, and the extension is designed to stay lightweight and out of the way while the student works.

---

## Current Design

The current UI is designed to be minimal and less overwhelming than the earlier prototype.

The color theme is based on:

```text
Primary: Cyan (#A7F3F7)
Light: Quill (#DFE0DD)
Dark: Gable Green (#153334)
```

The panel is intentionally compact so it does not take over the page. The main idea is that the student should focus on the page and only use AccessBridge when they need help.

The design goal is:

```text
simple enough for students
useful enough for a demo
technical enough to show what is happening
```

---

## Tech Stack

### Browser Extension

- Chrome Extension
- Manifest V3
- JavaScript
- Content script
- Background service worker
- CSS panel UI
- Chrome extension APIs

### Backend

- Node.js
- Express
- CORS
- dotenv

### Local AI

AccessBridge can use Ollama locally for text tasks such as:

- summaries
- simplification
- page questions
- student-friendly adaptation
- report drafting

For the current setup, the backend can connect to Ollama at:

```text
http://localhost:11434
```

### Natural Voice

The project can also use OpenAI text-to-speech for the optional natural voice feature.

This is only used for voice output. The rest of the AI text work can still run through the local Ollama setup.

---

## Project Structure

The project is organized like this:

```text
accessbridge/
  extension/
    manifest.json
    background.js
    content.js
    panel.css

  server/
    index.js
    package.json
    .env

  demo/
    inaccessible-demo.html
```

---

## Setup Instructions

### 1. Start the backend

Open a terminal:

```bash
cd C:\Users\errol\Hackathon\accessbridge\server
npm install
npm start
```

The backend should run on:

```text
http://localhost:3000
```

### 2. Start or confirm Ollama

Ollama usually runs in the background on Windows.

To check if it is running, open:

```text
http://localhost:11434
```

or run:

```powershell
curl http://localhost:11434/api/tags
```

If Ollama is not running, use:

```powershell
ollama serve
```

For the current project, a faster model is better for user experience. A small model like `llama3.2` is better for the demo than a larger slow reasoning model.

### 3. Add environment variables

Create or update:

```text
server/.env
```

Example:

```env
PORT=3000

AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
OLLAMA_VISION_MODEL=
OLLAMA_NUM_CTX=2048
OLLAMA_NUM_PREDICT=350
OLLAMA_KEEP_ALIVE=30m
OLLAMA_TIMEOUT_MS=8000

OPENAI_API_KEY=your_openai_api_key_here
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=marin
```

The OpenAI key is only needed if using the natural voice feature.

### 4. Load the extension

Open Chrome and go to:

```text
chrome://extensions
```

Then:

1. Turn on Developer Mode
2. Click `Load unpacked`
3. Select the `extension` folder

Make sure you select:

```text
accessbridge/extension
```

not the backend folder.

### 5. Use the extension

Open any webpage and press:

```text
Alt + X
```

AccessBridge should open on the page.

---

## Using ngrok for a Remote Demo

For the demo setup, the laptop can run the Chrome extension while the home desktop runs the backend, Ollama, and ngrok.

The flow looks like this:

```text
Laptop extension
→ ngrok public URL
→ home desktop backend on localhost:3000
→ Ollama on localhost:11434
```

This lets the extension on the laptop reach the backend running at home.

The backend should be exposed through ngrok, not Ollama directly.

Example:

```powershell
ngrok http 3000 --url=your-ngrok-domain.ngrok-free.dev
```

The extension background file should point to the ngrok URL if using the remote setup.

The home desktop must stay awake. If the desktop goes to sleep, the backend, Ollama connection, and ngrok tunnel will stop working.

---

## Backend Routes

The backend currently supports routes like:

```text
GET  /health
POST /summarize
POST /ask-page
POST /analyze-image
POST /natural-voice
```

### `/health`

Checks whether the backend is running and whether services like Ollama or natural voice are available.

### `/summarize`

Used for page summaries, simplification, and page adaptation.

### `/ask-page`

Used when a student asks a question about the page.

### `/analyze-image`

Used for screenshot/OCR-style image explanation.

### `/natural-voice`

Used for the optional OpenAI natural voice feature.

---

## Demo Flow

A simple demo flow could be:

1. Open the controlled demo page.
2. Press `Alt + X`.
3. Choose `Find what's important`.
4. Click `Make this page easier to understand and read`.
5. Show the adapted result.
6. Use page sections to jump around the page.
7. Try text-to-speech.
8. Try natural voice if the backend is ready.
9. Open the accessibility issue review.
10. Generate a report for a professor, SAS, or IT.

The best demo is not just showing that the tool finds issues. The best demo is showing that a student can get help quickly.

---

## Project Goal

The goal of AccessBridge is to give students immediate support when digital content is difficult or inaccessible.

It is especially focused on situations where:

- a website is outdated
- a page is not screen-reader friendly
- images do not have descriptions
- a video may not include captions
- information is too dense or confusing
- accessibility information is missing or hard to find
- students may feel uncomfortable asking for help repeatedly

AccessBridge is built around the belief that accessibility tools should be easy to use, fast to access, and respectful of student privacy.

---

## Privacy Approach

AccessBridge is designed around student control.

The extension only scans or processes a page when the student chooses to activate it. It does not constantly monitor browsing activity in the background.

Screenshots are only used when the student chooses the screenshot or OCR-style feature.

The API key stays in the backend. It is not placed inside the Chrome extension.

---

## Current Limitations

AccessBridge is still a hackathon project and prototype.

Some current limitations are:

- It is not a full WCAG audit tool.
- Some accessibility issues still need human review.
- AI responses may not always be perfect.
- Local AI speed depends on the computer and model being used.
- Natural voice requires an OpenAI API key.
- OCR/image explanation requires a supported vision model or API route.
- Some websites may block or interfere with extension behavior.
- The ngrok demo setup depends on the home computer staying awake.

---

## Plans / Future Improvements

There are several features I would like to improve after the hackathon.

### More Reliable OCR Support

Some school documents are scanned images instead of real selectable text. A future version could improve OCR support for screenshots, scanned documents, and image-based pages.

### Better Image and Chart Descriptions

Many course pages use images, diagrams, charts, or visual instructions. AccessBridge could continue improving how it describes visuals when alt text is missing or unclear.

### Better Reading Mode

Reading Mode could become more polished with better layout options, reading preferences, and saved settings.

### Stronger Text-to-Speech

The current project supports browser TTS and optional natural voice. A future version could improve audio controls, voice choices, and synchronization.

### Better Reports

The report feature could become more detailed and organized so students can send clearer feedback to the correct office, such as Student Accessibility Services, IT, Facilities, or a professor.

### More Student Preferences

Students could save preferences like:

- preferred support mode
- preferred voice
- reading speed
- contrast mode
- text size
- reduced motion

### Anonymous Accessibility Trends

A future version could help schools understand common accessibility problems by collecting anonymous patterns, such as pages that often have missing alt text, inaccessible PDFs, or unclear accessibility information.

This would need to be handled carefully with privacy in mind.

---

## Bigger Vision

AccessBridge is not just an AI summary tool.

It is a student accessibility support layer.

The bigger vision is to help students navigate digital spaces that were not always designed for them. It gives students a way to understand information, listen to content, simplify difficult pages, separate cluttered sections, and communicate accessibility issues more easily.

AccessBridge supports students while also reminding institutions that accessibility should be built into websites, documents, videos, and campus systems from the beginning.

---

## Final Pitch

AccessBridge is a browser extension that helps students access difficult school websites in the moment.

With one shortcut, students can make a page easier to understand, listen to important information, find deadlines or next steps, separate the page into clearer sections, and report possible accessibility barriers when needed.

It is a bridge between where digital accessibility should be and where many real school websites still are.

---

## Transparency

Please note that this README was written with the help of AI. The ideas, project concept, and direction are my own. I used AI to help organize the writing and make it sound clearer while keeping it close to how I would explain the project.
