import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { EXTRACTION_SYSTEM_PROMPT, buildRefinementPrompt } from "@/lib/prompts";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

// gemini-2.0-flash is on Google's free tier (rate-limited, no billing
// required) and supports vision + long system instructions. If this model
// name is ever retired, check https://ai.google.dev/gemini-api/docs/models
// for the current free-tier vision model and swap it in here.
const MODEL_NAME = "gemini-2.0-flash";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("image") as File | null;
    const refinementInstruction = form.get("refinementInstruction") as string | null;
    const priorDraft = form.get("priorDraft") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "image/jpeg";

    const userText =
      refinementInstruction && priorDraft
        ? buildRefinementPrompt(refinementInstruction, priorDraft)
        : "Extract this page according to your instructions and return the JSON.";

    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: EXTRACTION_SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json", // asks Gemini to return raw JSON, no markdown fences
      },
    });

    const result = await model.generateContent([
      { inlineData: { mimeType, data: base64 } },
      { text: userText },
    ]);

    const raw = result.response.text();

    let parsed;
    try {
      parsed = JSON.parse(stripFences(raw));
    } catch {
      return NextResponse.json(
        { mode: "unclear", reason: "Could not parse extraction. Please try again." },
        { status: 200 }
      );
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("extract error", err);
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}

function stripFences(text: string): string {
  return text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");
}
