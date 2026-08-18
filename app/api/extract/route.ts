import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { EXTRACTION_SYSTEM_PROMPT, buildRefinementPrompt } from "@/lib/prompts";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
const MODEL_NAME = "gemini-2.0-flash";

export async function POST(req: NextRequest) {
  try {
    // Read JSON payload instead of FormData
    const body = await req.json();
    const images = body.images as string[];
    const refinementInstruction = body.refinementInstruction as string | null;
    const priorDraft = body.priorDraft as any | null;

    if (!images || images.length === 0) {
      return NextResponse.json({ error: "No images uploaded" }, { status: 400 });
    }

    // Convert base64 data URIs back to Gemini's expected inlineData format for multiple images
    const imageParts = images.map((dataUrl) => {
      const [prefix, base64] = dataUrl.split(",");
      const mimeType = prefix.match(/:(.*?);/)?.[1] || "image/jpeg";
      return { inlineData: { mimeType, data: base64 } };
    });

    // Appended custom instruction to specifically target Header and Answer
    const userText =
      refinementInstruction && priorDraft
        ? buildRefinementPrompt(refinementInstruction, priorDraft)
        : "Analyze the provided images of textbook/study materials. 1. First, extract the exact Header or Question being asked. 2. Second, provide a clear, concise answer or summary of the notes beneath it. Return your results strictly in the requested JSON structure.";

    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: EXTRACTION_SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    // Pass all images and the user prompt
    const result = await model.generateContent([
      ...imageParts,
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
