import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { EXTRACTION_SYSTEM_PROMPT, buildRefinementPrompt } from "@/lib/prompts";

export const maxDuration = 60;
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

    // --- SMART KEY ROTATOR WITH RETRY LOGIC ---
    const keysString = process.env.GEMINI_API_KEY || "";
    const apiKeys = keysString.split(",").map(key => key.trim()).filter(key => key.length > 0);

    if (apiKeys.length === 0) {
      return NextResponse.json({ error: "No API keys configured" }, { status: 500 });
    }

    // Shuffle the keys so we distribute the load evenly across all available accounts
    const shuffledKeys = apiKeys.sort(() => Math.random() - 0.5);
    
    let result = null;
    let lastError = null;

    for (const key of shuffledKeys) {
      try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({
          model: MODEL_NAME,
          systemInstruction: EXTRACTION_SYSTEM_PROMPT,
          generationConfig: {
            responseMimeType: "application/json",
          },
        });

        // Try to generate content with the current key
        result = await model.generateContent([
          ...imageParts,
          { text: userText },
        ]);
        
        // If it succeeds, break out of the loop!
        break; 
        
      } catch (err: any) {
        lastError = err;
        const errorMessage = err.toString().toLowerCase();
        
        // If the error is a 429 Quota Exceeded or 503 Server Busy, log it and let the loop try the next key
        if (errorMessage.includes("429") || errorMessage.includes("quota") || errorMessage.includes("too many requests") || errorMessage.includes("503")) {
          console.warn("Key rate limited or server busy. Rotating to next available key...");
          continue; 
        } else {
          // If it's a different error (like a bad prompt), throw it immediately so we don't waste other keys
          throw err; 
        }
      }
    }

    // If the loop finishes and result is still null, ALL keys failed
    if (!result) {
      throw lastError || new Error("All API keys exceeded their quota.");
    }
    // ------------------------------------------

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
