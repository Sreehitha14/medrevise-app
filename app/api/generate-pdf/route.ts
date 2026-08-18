import { NextRequest, NextResponse } from "next/server";
import { getNotebook, appendPage, createNotebook, getPdfBytes } from "@/lib/store";
import { renderAndAppendPage } from "@/lib/pdfEngine";

export async function POST(req: NextRequest) {
  try {
    const { notebookId, newNotebookName, draft } = await req.json();

    if (!draft?.heading || !Array.isArray(draft?.sections)) {
      return NextResponse.json({ error: "Missing draft content" }, { status: 400 });
    }

    // Await the database calls
    let notebook = notebookId ? await getNotebook(notebookId) : undefined;
    if (!notebook) {
      if (!newNotebookName) {
        return NextResponse.json({ error: "notebookId or newNotebookName required" }, { status: 400 });
      }
      notebook = await createNotebook(newNotebookName);
    }

    // 1. Download the old PDF from Vercel Blob
    const existingPdfBytes = await getPdfBytes(notebook.pdfUrl);

    // 2. Add the new page
    const mergedPdf = await renderAndAppendPage(existingPdfBytes, draft);
    
    // 3. Upload the newly merged PDF back to Vercel Blob
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
  const notebook = id ? await getNotebook(id) : undefined;
  
  if (!notebook || !notebook.pdfUrl) {
    return NextResponse.json({ error: "Notebook not found or empty" }, { status: 404 });
  }
  
  // 1. Fetch the raw PDF file from Vercel Blob
  const res = await fetch(notebook.pdfUrl);
  const pdfBuffer = await res.arrayBuffer();

  // 2. Clean the filename to remove any weird characters
  const cleanName = notebook.name.replace(/[^a-zA-Z0-9-_\s]/g, "");

  // 3. Serve it to the browser with the proper notebook name!
  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${cleanName}.pdf"`,
    },
  });
}
