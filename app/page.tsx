"use client";

import { useState } from "react";
import ChatPanel from "@/components/ChatPanel";
import PdfManager from "@/components/PdfManager";

export default function Home() {
  // Bumped whenever a page is successfully generated, so PdfManager refetches.
  const [refreshTick, setRefreshTick] = useState(0);
  // Below the md breakpoint the two panels stack; this picks which one shows.
  const [mobileTab, setMobileTab] = useState<"chat" | "pdfs">("chat");

  return (
    <main className="flex flex-col" style={{ height: "100dvh" }}>
      <header className="h-14 flex items-center justify-between px-4 sm:px-6 border-b border-ink-800 shrink-0">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="font-display text-lg text-paper tracking-tight shrink-0">MedRevise</span>
          <span className="hidden sm:inline text-xs text-ink-500 font-body truncate">
            textbook photo → revision-ready PDF
          </span>
        </div>

        {/* Tab switcher — only shown below md, where panels stack instead of sitting side by side */}
        <div className="flex md:hidden rounded-full bg-ink-800 p-0.5 text-xs shrink-0">
          <button
            onClick={() => setMobileTab("chat")}
            className={`px-3 py-1.5 rounded-full transition ${mobileTab === "chat" ? "bg-accent text-white" : "text-ink-400"}`}
          >
            Chat
          </button>
          <button
            onClick={() => setMobileTab("pdfs")}
            className={`px-3 py-1.5 rounded-full transition ${mobileTab === "pdfs" ? "bg-accent text-white" : "text-ink-400"}`}
          >
            Notebooks
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <section
          className={`w-full md:w-[46%] md:min-w-[380px] md:border-r border-ink-800 flex-col min-h-0 ${
            mobileTab === "chat" ? "flex" : "hidden md:flex"
          }`}
        >
          <ChatPanel
            onPageGenerated={() => {
              setRefreshTick((t) => t + 1);
              setMobileTab("pdfs"); // jump to the notebook they just added to, on phone
            }}
          />
        </section>
        <section className={`flex-1 min-h-0 ${mobileTab === "pdfs" ? "block" : "hidden md:block"}`}>
          <PdfManager refreshTick={refreshTick} />
        </section>
      </div>
    </main>
  );
}
