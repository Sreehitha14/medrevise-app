import { NextRequest, NextResponse } from "next/server";
import { listNotebooks, createNotebook } from "@/lib/store";

export async function GET() {
  // Await the cloud fetch
  const notebooksList = await listNotebooks();
  
  const notebooks = notebooksList.map((nb) => ({
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
  
  // Await the cloud creation
  const nb = await createNotebook(name.trim());
  return NextResponse.json({ id: nb.id, name: nb.name, pageCount: 0 });
}
