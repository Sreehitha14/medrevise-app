import { NextRequest, NextResponse } from "next/server";
import { listNotebooks, createNotebook } from "@/lib/store";

export async function GET() {
  const notebooks = listNotebooks().map((nb) => ({
    id: nb.id,
    name: nb.name,
    pageCount: nb.pageCount,
    lastThumbnailText: nb.lastThumbnailText,
    updatedAt: nb.updatedAt,
  }));
  return NextResponse.json({ notebooks });
}

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Notebook name required" }, { status: 400 });
  }
  const nb = createNotebook(name.trim());
  return NextResponse.json({ id: nb.id, name: nb.name, pageCount: 0 });
}
