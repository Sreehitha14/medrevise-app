"use client";

import { useRef, useState } from "react";
import MessageBubble, { ChatMessage } from "./MessageBubble";
import { ExtractedDraft } from "@/lib/pdfEngine";

let idCounter = 0;
const nextId = () => `m${++idCounter}`;

export default function ChatPanel({ onPageGenerated }: { onPageGenerated: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: nextId(),
      role: "assistant",
      kind: "text",
      text:
        "Upload a photo of a textbook page and I'll pull out either the highlighted lines, or the high-yield points if nothing's marked. Nothing outside the page ever makes it into your notes.",
    },
  ]);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function push(msg: ChatMessage) {
    setMessages((prev) => [...prev, msg]);
  }

  function updateMessage(id: string, patch: Partial<ChatMessage>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? ({ ...m, ...patch } as ChatMessage) : m)));
  }

  async function handleFileSelected(file: File) {
    setPendingImage(file);
    const url = URL.createObjectURL(file);
    push({ id: nextId(), role: "assistant", kind: "image_preview", imageUrl: url });
    await runExtraction(file);
  }

  async function runExtraction(
    file: File,
    refinementInstruction?: string,
    priorDraft?: ExtractedDraft
  ) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("image", file);
      if (refinementInstruction && priorDraft) {
        form.append("refinementInstruction", refinementInstruction);
        form.append("priorDraft", JSON.stringify(priorDraft));
      }
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = await res.json();

      if (data.mode === "unclear") {
        push({ id: nextId(), role: "assistant", kind: "unclear", reason: data.reason ?? "Image unclear." });
        return;
      }

      push({ id: nextId(), role: "assistant", kind: "draft_review", draft: data as ExtractedDraft, resolved: false });
    } catch (e) {
      push({ id: nextId(), role: "assistant", kind: "text", text: "Extraction failed — please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove(messageId: string, draft: ExtractedDraft) {
    updateMessage(messageId, { resolved: true } as any);

    const res = await fetch("/api/notebooks");
    const data = await res.json();

    const routingId = nextId();
    push({
      id: routingId,
      role: "assistant",
      kind: "routing",
      notebooks: data.notebooks.map((n: any) => ({ id: n.id, name: n.name })),
      resolved: false,
    });

    // Stash the approved draft on the routing message via closure below.
    pendingDraftRef.current = draft;
    pendingRoutingMsgId.current = routingId;
  }

  const pendingDraftRef = useRef<ExtractedDraft | null>(null);
  const pendingRoutingMsgId = useRef<string | null>(null);

  async function handleRoute(notebookId: string | null, newName?: string) {
    if (!pendingDraftRef.current) return;
    if (pendingRoutingMsgId.current) {
      updateMessage(pendingRoutingMsgId.current, { resolved: true } as any);
    }

    setBusy(true);
    try {
      const res = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notebookId,
          newNotebookName: newName,
          draft: pendingDraftRef.current,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      push({
        id: nextId(),
        role: "assistant",
        kind: "text",
        text: `Added to "${data.notebookName}" — now ${data.pageCount} page${data.pageCount === 1 ? "" : "s"}. Upload the next page whenever you're ready.`,
      });
      onPageGenerated();
    } catch {
      push({ id: nextId(), role: "assistant", kind: "text", text: "Couldn't save that page — please try again." });
    } finally {
      setBusy(false);
      pendingDraftRef.current = null;
      pendingRoutingMsgId.current = null;
    }
  }

  async function handleRefinement(messageId: string, instruction: string, priorDraft: ExtractedDraft) {
    if (!pendingImage) return;
    updateMessage(messageId, { resolved: true } as any);
    push({ id: nextId(), role: "user", kind: "text", text: instruction });
    await runExtraction(pendingImage, instruction, priorDraft);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-3">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onApproveDraft={(draft) => handleApprove(m.id, draft)}
            onRequestRefinement={(instr) =>
              m.kind === "draft_review" && handleRefinement(m.id, instr, m.draft)
            }
            onRoute={(id, name) => handleRoute(id, name)}
          />
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-xl px-3.5 py-2 text-sm bg-ink-800 text-ink-500 animate-pulse">
              reading the page…
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-ink-800 p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            title="Upload a textbook page photo"
            className="w-9 h-9 shrink-0 rounded-full bg-ink-800 hover:bg-ink-700 flex items-center justify-center text-ink-300 disabled:opacity-40 transition"
          >
            <PaperclipIcon />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelected(f);
              e.target.value = "";
            }}
          />
          <div className="flex-1 text-xs text-ink-500 px-3 py-2 rounded-full bg-ink-800/60 border border-ink-800">
            Attach a page photo to get started
          </div>
        </div>
      </div>
    </div>
  );
}

function PaperclipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
