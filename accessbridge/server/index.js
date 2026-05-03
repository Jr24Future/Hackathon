import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(cors());
app.use(express.json({ limit: "15mb" }));

app.get("/", (req, res) => {
  res.send("AccessBridge backend is running.");
});

app.post("/summarize", async (req, res) => {
  try {
    const { mode, text, issues } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: "No text was provided."
      });
    }

    const trimmedText = text.slice(0, 12000);

    const issueText =
      Array.isArray(issues) && issues.length > 0
        ? issues
            .map((issue) => `- ${issue.severity}: ${issue.type} — ${issue.message}`)
            .join("\n")
        : "- No obvious accessibility issues were found by the basic scan.";

    const task =
      mode === "simple"
        ? "Rewrite this page in simpler, easier-to-understand language."
        : "Summarize this page clearly for a student.";

    const response = await client.responses.create({
      model: "gpt-5.4-mini",
      input: `
You are AccessBridge, an accessibility assistant for students.

Your job:
- Help students understand difficult or inaccessible web content.
- Use plain language.
- Keep the response short and useful.
- Do not say the page is definitely illegal or noncompliant.
- Use the phrase "possible accessibility barrier" when discussing issues.
- Make the output helpful for students with reading, vision, ADHD, dyslexia, or cognitive accessibility needs.

Task:
${task}

Possible accessibility issues found:
${issueText}

Page text:
${trimmedText}

Return the answer in this exact format:

Summary:
[short plain-language summary]

Key points:
- [point 1]
- [point 2]
- [point 3]

Possible accessibility barriers:
- [barrier 1]
- [barrier 2]

Student next steps:
- [step 1]
- [step 2]
`
    });

    res.json({
      summary: response.output_text
    });
  } catch (error) {
    console.error("Summarization error:", error);

    res.status(500).json({
      error: "The AI summarizer failed. Check your API key, billing, model access, or server logs."
    });
  }
});

app.post("/analyze-image", async (req, res) => {
  try {
    const { imageDataUrl } = req.body;

    if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
      return res.status(400).json({
        error: "No valid image was provided."
      });
    }

    const response = await client.responses.create({
      model: "gpt-5.5",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
You are AccessBridge, an accessibility assistant for students.

Analyze this screenshot.

Return the answer in this exact format:

Visible text found:
[Extract any important readable text from the screenshot. If there is no readable text, say that.]

Image or layout explanation:
[Explain what the screenshot appears to show in plain language.]

Possible accessibility barriers:
- [Mention possible barriers such as text trapped in images, missing image descriptions, dense layout, unclear buttons, low readability, etc.]

Student-friendly summary:
[Give a short plain-language summary that could be read aloud.]
              `
            },
            {
              type: "input_image",
              image_url: imageDataUrl
            }
          ]
        }
      ]
    });

    res.json({
      analysis: response.output_text
    });
  } catch (error) {
    console.error("Image analysis error:", error);

    res.status(500).json({
      error: "Image analysis failed. Check your API key, model access, image size, or server logs."
    });
  }
});

app.listen(PORT, () => {
  console.log(`AccessBridge backend running on http://localhost:${PORT}`);
});