"use client";

import { useEffect, useState } from "react";

interface NotebookSummary {
  id: string;
  name: string;
  pageCount: number;
  lastThumbnailText: string | null;
  updatedAt: string;
}

export default function PdfManager({ refreshTick }: { refreshTick: number }) {
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  async function load() {
    const res = await fetch("/api/notebooks");
    const data = await res.json();
    setNotebooks(data.notebooks);
  }

  useEffect(() => {
    load();
  }, [refreshTick]);

  async function handleCreate() {
    if (!newName.trim()) return;
    await fetch("/api/notebooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setNewName("");
    setCreating(false);
    load();
  }

  return (
    <div className="h-full flex flex-col min-h-0 bg-ink-950">
      <div className="shrink-0 px-6 py-4 flex items-center justify-between border-b border-ink-800">
        <div>
          <h2 className="font-display text-lg text-paper">Your notebooks</h2>
          <p className="text-xs text-ink-500 mt-0.5">Every approved page gets appended here — nothing is ever overwritten.</p>
        </div>
        <button
          onClick={() => setCreating((c) => !c)}
          className="px-3 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent/90 transition"
        >
          + New notebook
        </button>
      </div>

      {creating && (
        <div className="shrink-0 px-6 py-3 border-b border-ink-800 flex gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="e.g. Micro Unit 2"
            className="flex-1 bg-ink-800 text-paper text-sm rounded-md px-3 py-1.5 border border-ink-700 focus:border-accent outline-none"
          />
          <button onClick={handleCreate} className="px-3 py-1.5 rounded-md bg-good/20 text-good text-xs border border-good/30">
            Create
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
        {notebooks.length === 0 && (
          <div className="col-span-full text-center text-ink-500 text-sm mt-16">
            No notebooks yet. Upload a page in the chat to create your first one.
          </div>
        )}

        {notebooks.map((nb) => (
          <div key={nb.id} className="rounded-xl border border-ink-800 bg-ink-800/40 overflow-hidden hover:border-accent/50 transition group">
            <div className="notebook-page h-28 px-4 pt-3 relative overflow-hidden">
              <p className="font-handbold text-base text-ink-950 pl-6 truncate pr-2">
                {nb.lastThumbnailText ?? "Empty notebook"}
              </p>
              <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-paper to-transparent" />
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-paper font-medium">{nb.name}</p>
                <p className="text-xs text-ink-500">
                  {nb.pageCount} page{nb.pageCount === 1 ? "" : "s"}
                </p>
              </div>
              <a
                href={`/api/generate-pdf?id=${nb.id}`}
                className={`text-xs px-3 py-1.5 rounded-md border transition ${
                  nb.pageCount > 0
                    ? "border-accent text-accent hover:bg-accent/10"
                    : "border-ink-700 text-ink-600 pointer-events-none"
                }`}
              >
                Download
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
