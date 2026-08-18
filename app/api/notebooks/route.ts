import { NextRequest, NextResponse } from "next/server";
import { listNotebooks, createNotebook, deleteNotebook } from "@/lib/store";

export async function GET() {
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
  
  const nb = await createNotebook(name.trim());
  return NextResponse.json({ id: nb.id, name: nb.name, pageCount: 0 });
}

// NEW: DELETE route
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  
  if (!id) {
    return NextResponse.json({ error: "Notebook ID required" }, { status: 400 });
  }
  
  await deleteNotebook(id);
  return NextResponse.json({ success: true });
}
