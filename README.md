# MedRevise — Textbook-to-PDF Revision Assistant

A split-screen study app: chat with a vision-AI copilot on the left, manage
your notebooks on the right. Upload a photo of a textbook page, the assistant
extracts only what matters (highlights, or high-yield points if nothing is
highlighted), you approve it, and it's rendered onto a handwritten-style
notebook page and appended to whichever PDF you choose.

## Stack

- **Next.js 14 (App Router) + React + TypeScript** — single deployable app,
  frontend and API routes together.
- **Tailwind CSS** — styling.
- **Anthropic API (Claude, vision)** — image → extracted text, with the
  zero-hallucination system prompt baked in.
- **pdf-lib** — server-side PDF generation/concatenation (pure JS, no native
  deps, easy to deploy on Vercel/Node).
- In-memory store for the demo (`lib/store.ts`) — swap for Postgres/SQLite
  in production; the interface is already shaped for it.

## Folder structure

```
medrevise-app/
├── app/
│   ├── layout.tsx              # root layout, fonts
│   ├── globals.css             # design tokens + notebook paper styles
│   ├── page.tsx                # split-screen shell (Chat | PDF Manager)
│   └── api/
│       ├── extract/route.ts       # POST image -> vision extraction (Scenario A/B)
│       ├── generate-pdf/route.ts  # POST approved text -> render + append page
│       └── notebooks/route.ts     # GET list / POST create notebook
├── components/
│   ├── ChatPanel.tsx            # chat UI, upload, review & routing prompts
│   ├── MessageBubble.tsx        # chat message + extracted-text card
│   └── PdfManager.tsx           # notebook dashboard, previews, downloads
├── lib/
│   ├── prompts.ts               # the vision system prompt (zero-hallucination rules)
│   ├── pdfEngine.ts             # handwritten-style page renderer + concatenation
│   └── store.ts                 # notebook persistence (swap-in interface)
├── public/fonts/                # Patrick Hand / Caveat .ttf (add your own, see below)
├── package.json
├── tailwind.config.ts
└── next.config.js
```

## Setup

```bash
npm install
```

Add to `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Download two handwriting fonts and drop the `.ttf` files into `public/fonts/`:
- `PatrickHand-Regular.ttf` (Google Fonts: Patrick Hand)
- `Caveat-Bold.ttf` (Google Fonts: Caveat) — used for headings/highlight labels

```bash
npm run dev
```

## How the pieces fit together

1. **Upload** — user drops an image into `ChatPanel`. It's sent as
   `multipart/form-data` to `POST /api/extract`.
2. **Extraction** — `route.ts` sends the image + `lib/prompts.ts` system
   prompt to Claude's vision endpoint. The model returns strict JSON:
   `{ mode: "highlighted" | "high_yield", heading, bullets[] }`.
3. **Review** — the extracted draft is shown back in chat as a card. The
   user can type refinements ("make it more compact", "elaborate on point 2")
   which re-run extraction against the *same source image* with an amended
   instruction — never against outside knowledge.
4. **Routing** — once approved, quick-select buttons list existing
   notebooks (from `GET /api/notebooks`) plus "Create new".
5. **Generation** — `POST /api/generate-pdf` calls `lib/pdfEngine.ts`, which
   draws a lined-paper background, sets the extracted heading/bullets in the
   handwriting font with a yellow highlighter rectangle behind key terms,
   and **appends** this page to the chosen notebook's existing PDF bytes
   (loaded from the store, never overwritten).
6. **PDF Manager** — right panel lists notebooks with page counts and a
   thumbnail of the latest page; download button streams the full PDF.

## Notes on the "zero hallucination" contract

The system prompt in `lib/prompts.ts` is the single source of truth for
extraction behavior. It is intentionally strict (see comments inline) about:
- Never introducing facts absent from the image.
- Treating partial/fragment highlights by extracting the full sentence they
  sit in (for grammatical sense) but flagging fragments in the JSON so the
  UI can show the user exactly what was captured.
- Refusing (returning `{ mode: "unclear" }`) on illegible or low-contrast
  images instead of guessing, which the UI turns into a "please reupload"
  prompt.
