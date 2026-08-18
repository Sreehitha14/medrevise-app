import { put, list } from "@vercel/blob";

export interface Notebook {
  id: string;
  name: string;
  pageCount: number;
  pdfUrl: string | null;
  lastThumbnailText: string | null;
  updatedAt: string;
}

async function getIndex(): Promise<Notebook[]> {
  try {
    const { blobs } = await list({ prefix: 'index.json' });
    if (blobs.length === 0) return [];
    
    const res = await fetch(blobs[0].url, { cache: 'no-store' });
    return await res.json();
  } catch (e) {
    return [];
  }
}

async function saveIndex(notebooks: Notebook[]) {
  await put('index.json', JSON.stringify(notebooks), {
    access: 'public',
    addRandomSuffix: false,
  });
}

export async function listNotebooks(): Promise<Notebook[]> {
  const notebooks = await getIndex();
  return notebooks.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getNotebook(id: string): Promise<Notebook | undefined> {
  const notebooks = await getIndex();
  return notebooks.find((n) => n.id === id);
}

export async function createNotebook(name: string): Promise<Notebook> {
  const notebooks = await getIndex();
  const id = crypto.randomUUID();
  const nb: Notebook = {
    id,
    name,
    pageCount: 0,
    pdfUrl: null,
    lastThumbnailText: null,
    updatedAt: new Date().toISOString(),
  };
  notebooks.push(nb);
  await saveIndex(notebooks);
  return nb;
}

export async function appendPage(id: string, newPdfBytes: Uint8Array, heading: string): Promise<Notebook> {
  const notebooks = await getIndex();
  const nbIndex = notebooks.findIndex((n) => n.id === id);
  if (nbIndex === -1) throw new Error("Notebook not found");
  
  const nb = notebooks[nbIndex];
  
  const filename = `notebooks/${id}.pdf`;
  // Fixed: Converted Uint8Array to a Node Buffer for Vercel Blob
  const blob = await put(filename, Buffer.from(newPdfBytes), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/pdf',
  });

  nb.pdfUrl = blob.url;
  nb.pageCount += 1;
  nb.lastThumbnailText = heading;
  nb.updatedAt = new Date().toISOString();
  
  notebooks[nbIndex] = nb;
  await saveIndex(notebooks);
  return nb;
}

export async function getPdfBytes(url: string | null): Promise<Uint8Array | null> {
  if (!url) return null;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  const arrayBuffer = await res.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
