import { NextRequest, NextResponse } from "next/server";
import { getNotebook, appendPage, createNotebook } from "@/lib/store";
import { renderAndAppendPage } from "@/lib/pdfEngine";

export async function POST(req: NextRequest) {
  try {
    const { notebookId, newNotebookName, draft } = await req.json();

    if (!draft?.heading || !Array.isArray(draft?.sections)) {
      return NextResponse.json({ error: "Missing draft content" }, { status: 400 });
    }

    // Route to an existing notebook, or create one on the fly if the user
    // typed a new name via the "Create New PDF" flow.
    let notebook = notebookId ? getNotebook(notebookId) : undefined;
    if (!notebook) {
      if (!newNotebookName) {
        return NextResponse.json({ error: "notebookId or newNotebookName required" }, { status: 400 });
      }
      notebook = createNotebook(newNotebookName);
    }

    const mergedPdf = await renderAndAppendPage(notebook.pdfBytes, draft);
    const updated = appendPage(notebook.id, mergedPdf, draft.heading);

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
  // Streams the current merged PDF for download: /api/generate-pdf?id=<notebookId>
  const id = req.nextUrl.searchParams.get("id");
  const notebook = id ? getNotebook(id) : undefined;
  if (!notebook || !notebook.pdfBytes) {
    return NextResponse.json({ error: "Notebook not found or empty" }, { status: 404 });
  }
  return new NextResponse(Buffer.from(notebook.pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${notebook.name}.pdf"`,
    },
  });
}
