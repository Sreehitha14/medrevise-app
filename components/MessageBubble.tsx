"use client";

import { ExtractedDraft, Highlight } from "@/lib/pdfEngine";

export type ChatMessage =
  | { id: string; role: "assistant" | "user"; kind: "text"; text: string }
  | { id: string; role: "assistant"; kind: "image_preview"; imageUrl: string }
  | { id: string; role: "assistant"; kind: "draft_review"; draft: ExtractedDraft; resolved: boolean }
  | { id: string; role: "assistant"; kind: "routing"; notebooks: { id: string; name: string }[]; resolved: boolean }
  | { id: string; role: "assistant"; kind: "unclear"; reason: string };

const HIGHLIGHT_CLASS: Record<Highlight["color"], string> = {
  yellow: "bg-[#ffe066]",
  pink: "bg-[#fabfd9]",
  green: "bg-[#c8e69e]",
  blue: "bg-[#bcdbff]",
  orange: "bg-[#ffc780]",
};

const SECTION_ACCENTS = ["text-[#2a7352]", "text-[#335a9e]", "text-[#8c4080]"];

export default function MessageBubble({
  message,
  onApproveDraft,
  onRequestRefinement,
  onRoute,
}: {
  message: ChatMessage;
  onApproveDraft?: (draft: ExtractedDraft) => void;
  onRequestRefinement?: (instruction: string) => void;
  onRoute?: (notebookId: string | null, newName?: string) => void;
}) {
  const isUser = message.role === "user";

  if (message.kind === "text") {
    return (
      <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[85%] rounded-xl px-3.5 py-2 text-sm leading-relaxed ${
            isUser ? "bg-accent text-white" : "bg-ink-800 text-ink-300"
          }`}
        >
          {message.text}
        </div>
      </div>
    );
  }

  if (message.kind === "image_preview") {
    return (
      <div className="flex justify-end">
        <img src={message.imageUrl} alt="Uploaded page" className="max-w-[70%] rounded-lg border border-ink-700" />
      </div>
    );
  }

  if (message.kind === "unclear") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm bg-ink-800 border border-orange-900/40">
          <p className="text-orange-300 font-medium mb-1">Couldn't read this page clearly</p>
          <p className="text-ink-300 text-xs leading-relaxed">{message.reason}</p>
          <p className="text-ink-500 text-xs mt-2">Try a sharper, better-lit photo — I'd rather ask again than guess.</p>
        </div>
      </div>
    );
  }

  if (message.kind === "draft_review") {
    const { draft, resolved } = message;
    return (
      <div className="flex justify-start">
        <div className="max-w-[95%] w-full">
          <div className="notebook-page px-4 py-4 shadow-page">
            {/* Title box — dashed border, mirrors the PDF's title block */}
            <div className="border border-dashed border-[#4a72c7] bg-[#edf3fc] rounded-sm px-3 py-2 mb-3 text-center">
              <p className="font-handbold text-lg text-[#2f4b93] leading-tight">{draft.heading}</p>
              {draft.subtitle && <p className="text-[10px] text-[#6b7688] mt-0.5">{draft.subtitle}</p>}
            </div>

            {draft.sections.map((section, sIdx) => (
              <div key={sIdx} className="mb-3">
                <p className={`font-handbold text-sm ${SECTION_ACCENTS[sIdx % SECTION_ACCENTS.length]} border-b border-current/30 pb-0.5 mb-1.5`}>
                  {section.title}
                </p>
                <ul className="space-y-1 pl-1">
                  {section.bullets.map((b, i) => (
                    <li key={i} className="font-hand text-[13px] leading-snug text-ink-950">
                      <span className="mr-1">•</span>
                      <HighlightedText text={b.text} highlights={b.highlights} />
                      {b.wasFragment && (
                        <span className="ml-1 text-[9px] align-middle text-orange-700/70 font-body">
                          (extended from fragment)
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {draft.callout && (
              <div className="border border-[#d24a41] bg-[#fdedec] rounded-sm px-3 py-2 mt-2">
                <p className="text-[11px] font-handbold text-[#b5352c]">{draft.callout.label}</p>
                <p className="text-[11px] text-ink-950 font-hand leading-snug">{draft.callout.text}</p>
              </div>
            )}
          </div>

          {!resolved && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => onApproveDraft?.(draft)}
                className="px-3 py-1.5 rounded-md bg-good/20 text-good text-xs font-medium border border-good/30 hover:bg-good/30 transition"
              >
                ✓ Looks good
              </button>
              <button
                onClick={() => onRequestRefinement?.("Make this more compact")}
                className="px-3 py-1.5 rounded-md bg-ink-800 text-ink-300 text-xs border border-ink-700 hover:border-accent transition"
              >
                Compact it
              </button>
              <button
                onClick={() => onRequestRefinement?.("Elaborate slightly, using only the source text")}
                className="px-3 py-1.5 rounded-md bg-ink-800 text-ink-300 text-xs border border-ink-700 hover:border-accent transition"
              >
                Elaborate
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (message.kind === "routing") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] w-full">
          <div className="rounded-xl bg-ink-800 px-3.5 py-2.5 text-sm text-ink-300 mb-2">
            Which PDF should I add this to?
          </div>
          {!message.resolved && (
            <div className="flex flex-wrap gap-2">
              {message.notebooks.map((nb) => (
                <button
                  key={nb.id}
                  onClick={() => onRoute?.(nb.id)}
                  className="px-3 py-1.5 rounded-md bg-ink-800 text-paper text-xs border border-ink-700 hover:border-accent transition"
                >
                  Add to {nb.name}
                </button>
              ))}
              <button
                onClick={() => {
                  const name = window.prompt("New notebook name (e.g. Pharma Unit 3)");
                  if (name) onRoute?.(null, name);
                }}
                className="px-3 py-1.5 rounded-md bg-accent/20 text-accent text-xs border border-accent/40 hover:bg-accent/30 transition"
              >
                + Create new PDF
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

function HighlightedText({ text, highlights }: { text: string; highlights?: Highlight[] }) {
  if (!highlights || highlights.length === 0) return <>{text}</>;
  // Build non-overlapping ranges in order of appearance, then render spans.
  const ranges = highlights
    .map((h) => {
      const idx = text.toLowerCase().indexOf(h.text.toLowerCase());
      return idx === -1 ? null : { start: idx, end: idx + h.text.length, color: h.color };
    })
    .filter((r): r is { start: number; end: number; color: Highlight["color"] } => r !== null)
    .sort((a, b) => a.start - b.start);

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start > cursor) parts.push(<span key={`t${i}`}>{text.slice(cursor, r.start)}</span>);
    parts.push(
      <span key={`h${i}`} className={HIGHLIGHT_CLASS[r.color] + " text-ink-950 rounded-[1px]"}>
        {text.slice(r.start, r.end)}
      </span>
    );
    cursor = r.end;
  });
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>);
  return <>{parts}</>;
}
