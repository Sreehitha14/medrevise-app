import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { EXTRACTION_SYSTEM_PROMPT, buildRefinementPrompt } from "@/lib/prompts";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
const MODEL_NAME = "gemini-3.6-flash";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const images = body.images as string[];
    const refinementInstruction = body.refinementInstruction as string | null;
    const priorDraft = body.priorDraft as any | null;

    if (!images || images.length === 0) {
      return NextResponse.json({ error: "No images uploaded" }, { status: 400 });
    }

    const imageParts = images.map((dataUrl) => {
      const [prefix, base64] = dataUrl.split(",");
      const mimeType = prefix.match(/:(.*?);/)?.[1] || "image/jpeg";
      return { inlineData: { mimeType, data: base64 } };
    });

    let userText = "";
    
    if (refinementInstruction && priorDraft) {
      userText = buildRefinementPrompt(refinementInstruction, priorDraft);
    } else if (refinementInstruction) {
      // THIS IS THE UPDATED SECTION: Forcing Gemini to obey your commands
      userText = `Analyze the provided images. 

CRITICAL USER COMMAND: "${refinementInstruction}"

You MUST obey the command above absolutely. 
- If the user tells you to use a specific Question Name or Header, you must use their exact requested name instead of what is written in the image.
- If the user tells you to delete, skip, or ignore certain sections, you must leave them out of your summary.

1. Extract the Header/Question (or use the user's custom name).
2. Extract the summary of the notes.
Return your results strictly in the requested JSON structure.`;
    } else {
      userText = "Analyze the provided images of textbook/study materials. 1. First, extract the exact Header or Question being asked. 2. Second, provide a clear, concise answer or summary of the notes beneath it. Return your results strictly in the requested JSON structure.";
    }

    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: EXTRACTION_SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

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
