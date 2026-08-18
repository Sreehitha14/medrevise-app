"use client";

import { useRef, useState } from "react";
import MessageBubble, { ChatMessage } from "./MessageBubble";
import { ExtractedDraft } from "@/lib/pdfEngine";
import imageCompression from "browser-image-compression";

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
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function push(msg: ChatMessage) {
    setMessages((prev) => [...prev, msg]);
  }

  function updateMessage(id: string, patch: Partial<ChatMessage>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? ({ ...m, ...patch } as ChatMessage) : m)));
  }

  async function handleFilesSelected(files: File[]) {
    setPendingImages(files);
    // Preview the first image in the chat
    const url = URL.createObjectURL(files[0]);
    push({ id: nextId(), role: "assistant", kind: "image_preview", imageUrl: url });
    await runExtraction(files);
  }

  async function runExtraction(
    files: File[],
    refinementInstruction?: string,
    priorDraft?: ExtractedDraft
  ) {
    setBusy(true);
    try {
      // 1. Compress all files to prevent Vercel 413 Payload error
      const compressedFiles = await Promise.all(
        files.map(async (file) => {
          const options = {
            maxSizeMB: 1, // Compress to max 1MB each
            maxWidthOrHeight: 1920,
            useWebWorker: true,
          };
          return await imageCompression(file, options);
        })
      );

      // 2. Convert all compressed files to Base64 strings
      const base64Images = await Promise.all(
        compressedFiles.map((file) => {
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (error) => reject(error);
          });
        })
      );

      // 3. Send as JSON array instead of FormData
      const payload: any = { images: base64Images };
      if (refinementInstruction && priorDraft) {
        payload.refinementInstruction = refinementInstruction;
        payload.priorDraft = priorDraft;
      }

      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
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
      notebooks: data.notebooks?.map((n: any) => ({ id: n.id, name: n.name })),
      resolved: false,
    });

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
    if (!pendingImages.length) return;
    updateMessage(messageId, { resolved: true } as any);
    push({ id: nextId(), role: "user", kind: "text", text: instruction });
    await runExtraction(pendingImages, instruction, priorDraft);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-3">
        {/* Optional chaining (?) added below to prevent the client crash */}
        {messages?.map((m) => (
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
            title="Upload textbook page photo(s)"
            className="w-9 h-9 shrink-0 rounded-full bg-ink-800 hover:bg-ink-700 flex items-center justify-center text-ink-300 disabled:opacity-40 transition"
          >
            <PaperclipIcon />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple // This allows selecting multiple photos
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) handleFilesSelected(files);
              e.target.value = "";
            }}
          />
          <div className="flex-1 text-xs text-ink-500 px-3 py-2 rounded-full bg-ink-800/60 border border-ink-800">
            Attach page photo(s) to get started
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
