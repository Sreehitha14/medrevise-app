import { NextRequest, NextResponse } from "next/server";
import { getNotebook, appendPage, createNotebook, getPdfBytes } from "@/lib/store";
import { renderAndAppendPage } from "@/lib/pdfEngine";

export async function POST(req: NextRequest) {
  try {
    const { notebookId, newNotebookName, draft } = await req.json();

    if (!draft?.heading || !Array.isArray(draft?.sections)) {
      return NextResponse.json({ error: "Missing draft content" }, { status: 400 });
    }

    let notebook = notebookId ? await getNotebook(notebookId) : undefined;
    if (!notebook) {
      if (!newNotebookName) {
        return NextResponse.json({ error: "notebookId or newNotebookName required" }, { status: 400 });
      }
      notebook = await createNotebook(newNotebookName);
    }

    const existingPdfBytes = await getPdfBytes(notebook.pdfUrl);
    const mergedPdf = await renderAndAppendPage(existingPdfBytes, draft);
    
    const updated = await appendPage(notebook.id, mergedPdf, draft.heading);

    return NextResponse.json({
      notebookId: updated.id,
      notebookName: updated.name,
      pageCount: updated.pageCount,
    });
  } catch (err) {
    console.error("generate-pdf error", err);
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  // NEW: Detect action type
  const action = req.nextUrl.searchParams.get("action") || "view"; 
  const notebook = id ? await getNotebook(id) : undefined;
  
  if (!notebook || !notebook.pdfUrl) {
    return NextResponse.json({ error: "Notebook not found or empty" }, { status: 404 });
  }
  
  const res = await fetch(notebook.pdfUrl);
  const pdfBuffer = await res.arrayBuffer();

  const cleanName = notebook.name.replace(/[^a-zA-Z0-9-_\s]/g, "");
  // NEW: Switch between attachment (download) and inline (view)
  const disposition = action === "download" ? "attachment" : "inline";

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${cleanName}.pdf"`,
    },
  });
}
