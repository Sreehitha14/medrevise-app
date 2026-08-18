// Demo persistence layer. Swap the internals for Postgres/SQLite/S3 later —
// keep this exact interface so routes and components don't need to change.

export interface Notebook {
  id: string;
  name: string;
  pageCount: number;
  pdfBytes: Uint8Array | null; // the concatenated PDF, grows over time
  lastThumbnailText: string | null; // heading of most recently appended page
  updatedAt: string;
}

const notebooks = new Map<string, Notebook>();

export function listNotebooks(): Notebook[] {
  return Array.from(notebooks.values()).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getNotebook(id: string): Notebook | undefined {
  return notebooks.get(id);
}

export function createNotebook(name: string): Notebook {
  const id = crypto.randomUUID();
  const nb: Notebook = {
    id,
    name,
    pageCount: 0,
    pdfBytes: null,
    lastThumbnailText: null,
    updatedAt: new Date().toISOString(),
  };
  notebooks.set(id, nb);
  return nb;
}

export function appendPage(id: string, newPdfBytes: Uint8Array, heading: string): Notebook {
  const nb = notebooks.get(id);
  if (!nb) throw new Error("Notebook not found");
  nb.pdfBytes = newPdfBytes; // caller has already merged old + new
  nb.pageCount += 1;
  nb.lastThumbnailText = heading;
  nb.updatedAt = new Date().toISOString();
  return nb;
}
