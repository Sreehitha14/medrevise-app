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
      text: "Upload up to 10 textbook photos. You can type a specific question name or instruction before hitting send!",
    },
  ]);
  const [busy, setBusy] = useState(false);
  
  // Staging Area State
  const [stagedImages, setStagedImages] = useState<File[]>([]);
  const [instruction, setInstruction] = useState("");
  const [lastUploadedImages, setLastUploadedImages] = useState<File[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function push(msg: ChatMessage) {
    setMessages((prev) => [...prev, msg]);
  }

  function updateMessage(id: string, patch: Partial<ChatMessage>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? ({ ...m, ...patch } as ChatMessage) : m)));
  }

  function handleFilesSelected(files: File[]) {
    setStagedImages((prev) => {
      const combined = [...prev, ...files];
      if (combined.length > 10) {
        alert("You can only upload a maximum of 10 images at once.");
        return combined.slice(0, 10);
      }
      return combined;
    });
  }

  function removeStagedImage(index: number) {
    setStagedImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (stagedImages.length === 0) return;

    const filesToProcess = [...stagedImages];
    const currentInstruction = instruction;

    setStagedImages([]);
    setInstruction("");
    setLastUploadedImages(filesToProcess);

    // Fixed: role set to "assistant" to satisfy the ChatMessage type definition
   // Show a preview bubble for EVERY image
    filesToProcess.forEach((file) => {
      const url = URL.createObjectURL(file);
      push({ id: nextId(), role: "assistant", kind: "image_preview", imageUrl: url });
    });
    
    if (currentInstruction.trim()) {
      push({ id: nextId(), role: "user", kind: "text", text: currentInstruction });
    }

    await runExtraction(filesToProcess, currentInstruction);
  }

  async function runExtraction(
    files: File[],
    userInstruction?: string,
    priorDraft?: ExtractedDraft
  ) {
    setBusy(true);
    try {
      const compressedFiles = await Promise.all(
        files.map(async (file) => {
          const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
          return await imageCompression(file, options);
        })
      );

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

      const payload: any = { images: base64Images };
      if (userInstruction) payload.refinementInstruction = userInstruction;
      if (priorDraft) payload.priorDraft = priorDraft;

      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      const data = await res.json();

      if (!res.ok || data.error) throw new Error(data.error || "Server error");

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
        text: `Added to "${data.notebookName}" — now ${data.pageCount} page${data.pageCount === 1 ? "" : "s"}.`,
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
    if (!lastUploadedImages.length) return;
    updateMessage(messageId, { resolved: true } as any);
    push({ id: nextId(), role: "user", kind: "text", text: instruction });
    await runExtraction(lastUploadedImages, instruction, priorDraft);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-3">
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

      <div className="shrink-0 border-t border-ink-800 p-3 bg-ink-900 flex flex-col gap-3">
        {stagedImages.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {stagedImages.map((file, i) => (
              <div key={i} className="relative w-14 h-14 shrink-0 rounded-lg overflow-hidden border border-ink-700">
                <img src={URL.createObjectURL(file)} className="object-cover w-full h-full opacity-80" alt="preview" />
                <button
                  onClick={() => removeStagedImage(i)}
                  className="absolute top-0 right-0 bg-red-500 hover:bg-red-600 text-white w-5 h-5 flex items-center justify-center rounded-bl-lg text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy || stagedImages.length >= 10}
            title="Attach images (Max 10)"
            className="w-10 h-10 shrink-0 rounded-full bg-ink-800 hover:bg-ink-700 flex items-center justify-center text-ink-300 disabled:opacity-40 transition"
          >
            <PaperclipIcon />
          </button>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) handleFilesSelected(files);
              e.target.value = ""; 
            }}
          />

          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Add an instruction or hit send..."
            disabled={busy}
            className="flex-1 bg-ink-800 border border-ink-700 rounded-full px-4 py-2.5 text-sm text-ink-100 outline-none transition disabled:opacity-50"
          />

          <button
            onClick={handleSubmit}
            disabled={busy || stagedImages.length === 0}
            className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white rounded-full px-5 py-2.5 text-sm font-medium transition disabled:opacity-50 disabled:bg-ink-800"
          >
            Send
          </button>
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
