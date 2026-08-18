import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTION_SYSTEM_PROMPT, buildRefinementPrompt } from "@/lib/prompts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    const mediaType = file.type || "image/jpeg";

    const userText =
      refinementInstruction && priorDraft
        ? buildRefinementPrompt(refinementInstruction, priorDraft)
        : "Extract this page according to your instructions and return the JSON.";

    const response = await anthropic.messages.create({
      model: "claude-sonnet-5", // strong vision + JSON-following; swap for claude-opus-4-8 if you need higher accuracy on dense/cluttered pages
      max_tokens: 1500,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType as any, data: base64 },
            },
            { type: "text", text: userText },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";

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
