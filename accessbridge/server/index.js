// small backend for accessbridge
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

// loads the .env stuff
dotenv.config();

const app = express();

// things we can swap without touching the code
const PORT = process.env.PORT || 3000;
const AI_PROVIDER = process.env.AI_PROVIDER || "ollama";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "deepseek-r1:8b";
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || "";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || "marin";

// only used for the nicer voice
const openai = OPENAI_API_KEY
  ? new OpenAI({
      apiKey: OPENAI_API_KEY
    })
  : null;

// lets the extension talk to this server
app.use(cors());
app.use(express.json({ limit: "20mb" }));

// deepseek likes to think out loud sometimes
function stripDeepSeekThinking(text) {
  if (!text) return "";

  return String(text)
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .trim();
}

function buildIssueText(issues) {
  if (!Array.isArray(issues) || issues.length === 0) {
    return "- No obvious accessibility issues were found by the local scan.";
  }

  return issues
    .slice(0, 20)
    .map((issue) => {
      const severity = issue.severity || "Info";
      const type = issue.type || "Possible barrier";
      const message = issue.message || "No message provided.";
      return `- ${severity}: ${type} — ${message}`;
    })
    .join("\n");
}

function cleanTtsText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[#*_`>|]/g, "")
    .trim()
    .slice(0, 3500);
}

//here the ollama request actually happens
async function callOllamaChat({
  model = OLLAMA_MODEL,
  messages,
  images = [],
  timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 8000)
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const numCtx = Number(process.env.OLLAMA_NUM_CTX || 2048);
  const numPredict = Number(process.env.OLLAMA_NUM_PREDICT || 350);
  const keepAlive = process.env.OLLAMA_KEEP_ALIVE || "30m";

  try {
    const body = {
      model,
      messages,
      stream: false,
      keep_alive: keepAlive,
      options: {
        num_ctx: numCtx,
        num_predict: numPredict,
        temperature: 0.2,
        top_p: 0.9
      }
    };

    if (images.length > 0) {
      body.messages = messages.map((message, index) => {
        if (index === messages.length - 1) {
          return {
            ...message,
            images
          };
        }

        return message;
      });
    }

    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama request failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    return stripDeepSeekThinking(data?.message?.content || "");
  } finally {
    clearTimeout(timeout);
  }
}

function getModeInstruction(mode) {
  if (mode === "simple") {
    return "Rewrite the page in simpler, easier-to-understand language.";
  }

  if (mode === "focus") {
    return "Extract what matters most: deadlines, required actions, forms, contacts, and next steps.";
  }

  if (mode === "audio") {
    return "Create a short audio-friendly version that is easy to read aloud.";
  }

  if (mode === "lowVision") {
    return "Create a clear, structured version with short sections and obvious next steps.";
  }

  return "Summarize this page clearly for a student.";
}

// builds the main prompt for the page help
function buildAccessBridgePrompt({ mode, text, issues }) {
  const issueText = buildIssueText(issues);
  const task = getModeInstruction(mode);

  return `
You are AccessBridge, a student accessibility adaptation assistant.

Your job:
- Help students understand difficult school websites.
- Use plain language.
- Focus on what the student needs to know and do.
- Do not claim this is an official WCAG audit.
- Say "possible accessibility barrier" when discussing issues.
- Keep the answer practical and student-friendly.

Task:
${task}

Possible accessibility barriers found by AccessBridge:
${issueText}

Page text:
${String(text || "").slice(0, 5000)}

Return the answer in this format:

What this page is about:
[short plain-language explanation]

What you may need to do next:
- [action 1]
- [action 2]
- [action 3]

Important details:
- [detail 1]
- [detail 2]
- [detail 3]

Possible accessibility barriers:
- [barrier 1]
- [barrier 2]

Student-friendly version:
[short adapted version of the page]
`;
}

app.get("/", (req, res) => {
  res.send("AccessBridge local backend is running with Ollama support and optional OpenAI natural voice.");
});

// quick status check
app.get("/health", async (req, res) => {
  let ollamaConnected = false;
  let ollamaError = null;

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    ollamaConnected = response.ok;
    if (!response.ok) {
      ollamaError = `Ollama returned status ${response.status}`;
    }
  } catch (error) {
    ollamaConnected = false;
    ollamaError = error.message;
  }

  res.json({
    status: "ok",
    provider: AI_PROVIDER,
    backendPort: PORT,
    ollamaBaseUrl: OLLAMA_BASE_URL,
    ollamaConnected,
    ollamaError,
    ollamaModel: OLLAMA_MODEL,
    ollamaVisionModel: OLLAMA_VISION_MODEL || null,
    imageAnalysisAvailable: Boolean(OLLAMA_VISION_MODEL),
    naturalVoiceAvailable: Boolean(openai),
    openaiTtsModel: OPENAI_TTS_MODEL,
    openaiTtsVoice: OPENAI_TTS_VOICE,
    routes: ["/health", "/summarize", "/ask-page", "/analyze-image", "/natural-voice"]
  });
});

// summarize page
app.post("/summarize", async (req, res) => {
  try {
    const { mode = "summary", text, issues = [] } = req.body;

    if (!text || !String(text).trim()) {
      return res.status(400).json({
        error: "No text was provided."
      });
    }

    const prompt = buildAccessBridgePrompt({ mode, text, issues });

    const answer = await callOllamaChat({
      model: OLLAMA_MODEL,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      timeoutMs: 60000
    });

    res.json({
      summary: answer,
      provider: "ollama",
      model: OLLAMA_MODEL
    });
  } catch (error) {
    console.error("Summarization error:", error);

    res.status(500).json({
      error: "Local Ollama summarizer failed. Make sure Ollama is running and the model is pulled.",
      details: error.message
    });
  }
});

// ask about the current page
app.post("/ask-page", async (req, res) => {
  try {
    const { question, text, issues = [] } = req.body;

    if (!question || !String(question).trim()) {
      return res.status(400).json({
        error: "No question was provided."
      });
    }

    if (!text || !String(text).trim()) {
      return res.status(400).json({
        error: "No page text was provided."
      });
    }

    const issueText = buildIssueText(issues);

    const prompt = `
You are AccessBridge, a student accessibility assistant.

Answer the student's question using only the page text below.

Rules:
- Use plain language.
- Be concise.
- If the page does not contain the answer, say that clearly.
- Include the best next step if possible.
- Do not claim this is an official accessibility or accommodation decision.

Student question:
${question}

Possible accessibility barriers found:
${issueText}

Page text:
${String(text).slice(0, 5000)}
`;

    const answer = await callOllamaChat({
      model: OLLAMA_MODEL,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      timeoutMs: 60000
    });

    res.json({
      answer,
      provider: "ollama",
      model: OLLAMA_MODEL
    });
  } catch (error) {
    console.error("Ask page error:", error);

    res.status(500).json({
      error: "Local Ollama question answering failed.",
      details: error.message
    });
  }
});

// screenshot helper if a vision model is setup
app.post("/analyze-image", async (req, res) => {
  try {
    const { imageDataUrl } = req.body;

    if (!imageDataUrl || !String(imageDataUrl).startsWith("data:image/")) {
      return res.status(400).json({
        error: "No valid image was provided."
      });
    }

    if (!OLLAMA_VISION_MODEL) {
      return res.status(501).json({
        error:
          "Image analysis requires a local vision model. Set OLLAMA_VISION_MODEL=llama3.2-vision or OLLAMA_VISION_MODEL=llava:7b."
      });
    }

    const base64Image = String(imageDataUrl).replace(/^data:image\/\w+;base64,/, "");

    const prompt = `
You are AccessBridge, a student accessibility assistant.

Analyze this screenshot for a student.

Return:

Visible text found:
[Extract important readable text.]

Image or layout explanation:
[Explain what this screenshot appears to show.]

Possible accessibility barriers:
- [Mention text trapped in images, chart/diagram issues, dense layout, unclear controls, etc.]

Student-friendly summary:
[Short summary that can be read aloud.]
`;

    const analysis = await callOllamaChat({
      model: OLLAMA_VISION_MODEL,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      images: [base64Image],
      timeoutMs: 90000
    });

    res.json({
      analysis,
      provider: "ollama",
      model: OLLAMA_VISION_MODEL
    });
  } catch (error) {
    console.error("Image analysis error:", error);

    res.status(500).json({
      error: "Local Ollama image analysis failed.",
      details: error.message
    });
  }
});

// optional ai voice
app.post("/natural-voice", async (req, res) => {
  try {
    if (!openai) {
      return res.status(503).json({
        error: "Natural voice is not configured. Add OPENAI_API_KEY to your .env file."
      });
    }

    const { text, voice } = req.body;
    const cleanedText = cleanTtsText(text);

    if (!cleanedText) {
      return res.status(400).json({
        error: "No text was provided for natural voice."
      });
    }

    const selectedVoice = voice || OPENAI_TTS_VOICE;

    const speech = await openai.audio.speech.create({
      model: OPENAI_TTS_MODEL,
      voice: selectedVoice,
      input: cleanedText,
      instructions:
        "Speak clearly, warmly, and calmly, like a supportive student accessibility assistant. Use a natural pace and avoid sounding robotic."
    });

    const audioBuffer = Buffer.from(await speech.arrayBuffer());
    const audioDataUrl = `data:audio/mpeg;base64,${audioBuffer.toString("base64")}`;

    res.json({
      audioDataUrl,
      provider: "openai",
      model: OPENAI_TTS_MODEL,
      voice: selectedVoice,
      disclosure: "This natural voice is AI-generated."
    });
  } catch (error) {
    console.error("Natural voice error:", error);

    res.status(500).json({
      error: "Natural voice generation failed.",
      details: error.message
    });
  }
});

// starts everything
app.listen(PORT, () => {
  console.log(`AccessBridge local backend running on http://localhost:${PORT}`);
  console.log(`AI provider: ${AI_PROVIDER}`);
  console.log(`Ollama model: ${OLLAMA_MODEL}`);
  console.log(`Ollama base URL: ${OLLAMA_BASE_URL}`);
  console.log(`Natural voice available: ${Boolean(openai)}`);
  console.log(`OpenAI TTS model: ${OPENAI_TTS_MODEL}`);
  console.log(`OpenAI TTS voice: ${OPENAI_TTS_VOICE}`);
});