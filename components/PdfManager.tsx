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

  // NEW: Delete handler!
  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this notebook? This cannot be undone.")) return;
    
    await fetch(`/api/notebooks?id=${id}`, { method: "DELETE" });
    load(); // Refresh the list so the card disappears
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
          <div key={nb.id} className="rounded-xl border border-ink-800 bg-ink-800/40 overflow-hidden hover:border-accent/50 transition group flex flex-col">
            <div className="notebook-page h-28 px-4 pt-3 relative overflow-hidden shrink-0">
              <p className="font-handbold text-base text-ink-950 pl-6 truncate pr-2">
                {nb.lastThumbnailText ?? "Empty notebook"}
              </p>
              <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-paper to-transparent" />
            </div>
            
            <div className="px-4 py-3 flex items-center justify-between border-t border-ink-800/50 flex-1">
              <div>
                <p className="text-sm text-paper font-medium truncate max-w-[120px]">{nb.name}</p>
                <p className="text-xs text-ink-500">
                  {nb.pageCount} page{nb.pageCount === 1 ? "" : "s"}
                </p>
              </div>
              
              {/* NEW: Updated Action Row */}
              <div className="flex items-center gap-1.5">
                {nb.pageCount > 0 ? (
                  <>
                    <a
                      href={`/api/generate-pdf?id=${nb.id}&action=view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-3 py-1.5 rounded-md border border-ink-700 text-ink-400 hover:text-paper hover:bg-ink-700 transition"
                    >
                      View
                    </a>
                    <a
                      href={`/api/generate-pdf?id=${nb.id}&action=download`}
                      className="text-xs px-3 py-1.5 rounded-md border border-accent text-accent hover:bg-accent/10 transition"
                    >
                      Download
                    </a>
                  </>
                ) : (
                  <span className="text-xs px-3 py-1.5 rounded-md border border-ink-700 text-ink-600 pointer-events-none">
                    Empty
                  </span>
                )}

                {/* Trash Button */}
                <button
                  onClick={() => handleDelete(nb.id)}
                  className="p-1.5 ml-1 rounded-md text-ink-500 hover:text-red-400 hover:bg-red-400/10 transition"
                  title="Delete Notebook"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
