import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs/promises";
import path from "path";

export interface Highlight {
  text: string;
  color: "yellow" | "pink" | "green" | "blue" | "orange";
}

export interface ExtractedBullet {
  text: string;
  wasFragment?: boolean;
  highlights?: Highlight[];
}

export interface ExtractedSection {
  title: string;
  bullets: ExtractedBullet[];
}

export interface ExtractedDraft {
  heading: string;
  subtitle?: string;
  sections: ExtractedSection[];
  callout?: { label: string; text: string };
}

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN_L = 54;
const MARGIN_R = 40;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
const LINE_HEIGHT = 15;
const BODY_SIZE = 10.5;

const INK = rgb(0.1, 0.11, 0.15);
const RULE_COLOR = rgb(0.83, 0.87, 0.9);
const TITLE_BORDER = rgb(0.29, 0.45, 0.78); // dashed blue box
const TITLE_BG = rgb(0.93, 0.96, 0.99);

// Section-heading + callout accents cycle through these
const SECTION_ACCENTS = [rgb(0.16, 0.45, 0.32), rgb(0.2, 0.35, 0.62), rgb(0.55, 0.25, 0.5)];
const CALLOUT_BORDER = rgb(0.82, 0.29, 0.25);
const CALLOUT_BG = rgb(0.99, 0.93, 0.92);

const HIGHLIGHT_HEX: Record<Highlight["color"], { r: number; g: number; b: number }> = {
  yellow: { r: 1, g: 0.878, b: 0.4 },
  pink: { r: 0.98, g: 0.75, b: 0.85 },
  green: { r: 0.78, g: 0.9, b: 0.62 },
  blue: { r: 0.74, g: 0.86, b: 1 },
  orange: { r: 1, g: 0.78, b: 0.5 },
};

/**
 * Safely converts un-draw-able symbols into standard text.
 * Prevents the dreaded WinAnsi encoding crash!
 */
export function sanitizeForPdf(text: string): string {
  if (!text) return "";
  return text
    .replace(/α/g, "alpha")
    .replace(/β/g, "beta")
    .replace(/γ/g, "gamma")
    .replace(/δ/g, "delta")
    .replace(/θ/g, "theta")
    .replace(/μ/g, "micro")
    .replace(/π/g, "pi")
    .replace(/σ/g, "sigma")
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/↑/g, "(up)")
    .replace(/↓/g, "(down)")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/±/g, "+/-");
}

export async function renderAndAppendPage(
  existingPdfBytes: Uint8Array | null,
  draft: ExtractedDraft
): Promise<Uint8Array> {
  const doc = existingPdfBytes
    ? await PDFDocument.load(existingPdfBytes)
    : await PDFDocument.create();

  doc.registerFontkit(fontkit);
  const [reg, bold] = await loadHandwritingFonts(doc);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  drawRuledBackground(page);
  let cursorY = PAGE_H - 36;

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    drawRuledBackground(page);
    cursorY = PAGE_H - 36;
  };
  const ensureRoom = (needed: number) => {
    if (cursorY - needed < 44) newPage();
  };

  // --- Title box ---
  const safeHeading = sanitizeForPdf(draft.heading);
  const safeSubtitle = draft.subtitle ? sanitizeForPdf(draft.subtitle) : undefined;

  const titleBoxH = safeSubtitle ? 46 : 34;
  page.drawRectangle({
    x: MARGIN_L,
    y: cursorY - titleBoxH,
    width: CONTENT_W,
    height: titleBoxH,
    color: TITLE_BG,
    borderColor: TITLE_BORDER,
    borderWidth: 1,
    borderDashArray: [4, 3],
  });
  const titleSize = fitFontSize(safeHeading, bold, 17, CONTENT_W - 24);
  centerText(page, safeHeading, bold, titleSize, cursorY - titleBoxH / 2 + (safeSubtitle ? 8 : -titleSize / 3), TITLE_BORDER);
  if (safeSubtitle) {
    centerText(page, safeSubtitle, reg, 9, cursorY - titleBoxH + 12, rgb(0.4, 0.46, 0.55));
  }
  cursorY -= titleBoxH + 16;

  // --- Sections ---
  draft.sections.forEach((section, sIdx) => {
    const accent = SECTION_ACCENTS[sIdx % SECTION_ACCENTS.length];
    const safeTitle = sanitizeForPdf(section.title);
    
    ensureRoom(30);
    page.drawText(safeTitle, { x: MARGIN_L, y: cursorY, size: 12, font: bold, color: accent });
    cursorY -= 5;
    page.drawLine({
      start: { x: MARGIN_L, y: cursorY },
      end: { x: PAGE_W - MARGIN_R, y: cursorY },
      thickness: 1,
      color: accent,
      opacity: 0.5,
    });
    cursorY -= 14;

    for (const bullet of section.bullets) {
      const safeBulletText = sanitizeForPdf(bullet.text);
      
      // Sanitize the highlights so the string matching index still works perfectly!
      const safeHighlights = bullet.highlights?.map(h => ({
        text: sanitizeForPdf(h.text),
        color: h.color
      }));

      const lines = wrapWithHighlights(`•  ${safeBulletText}`, reg, BODY_SIZE, CONTENT_W - 10, safeHighlights);
      for (const lineSpans of lines) {
        ensureRoom(LINE_HEIGHT);
        drawSpans(page, lineSpans, reg, BODY_SIZE, MARGIN_L + 4, cursorY);
        cursorY -= LINE_HEIGHT;
      }
    }
    cursorY -= 8;
  });

  // --- Callout box ---
  if (draft.callout) {
    const safeCalloutText = sanitizeForPdf(draft.callout.text);
    const safeCalloutLabel = sanitizeForPdf(draft.callout.label);

    const calloutLines = wrapText(safeCalloutText, reg, 9.5, CONTENT_W - 24);
    const calloutH = 22 + calloutLines.length * 13;
    ensureRoom(calloutH + 10);
    page.drawRectangle({
      x: MARGIN_L,
      y: cursorY - calloutH,
      width: CONTENT_W,
      height: calloutH,
      color: CALLOUT_BG,
      borderColor: CALLOUT_BORDER,
      borderWidth: 1,
    });
    page.drawText(safeCalloutLabel, {
      x: MARGIN_L + 10,
      y: cursorY - 15,
      size: 9.5,
      font: bold,
      color: CALLOUT_BORDER,
    });
    let cy = cursorY - 30;
    for (const line of calloutLines) {
      page.drawText(line, { x: MARGIN_L + 10, y: cy, size: 9.5, font: reg, color: INK });
      cy -= 13;
    }
    cursorY -= calloutH + 10;
  }

  return doc.save();
}

async function loadHandwritingFonts(doc: PDFDocument) {
  try {
    const regularBytes = await fs.readFile(
      path.join(process.cwd(), "public/fonts/PatrickHand-Regular.ttf")
    );
    const boldBytes = await fs.readFile(path.join(process.cwd(), "public/fonts/Caveat-Bold.ttf"));
    const regular = await doc.embedFont(regularBytes);
    const bold = await doc.embedFont(boldBytes);
    return [regular, bold] as const;
  } catch {
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    return [regular, bold] as const;
  }
}

function drawRuledBackground(page: import("pdf-lib").PDFPage) {
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(0.98, 0.965, 0.918) });
  for (let y = PAGE_H - 90; y > 30; y -= LINE_HEIGHT) {
    page.drawLine({ start: { x: 24, y }, end: { x: PAGE_W - 24, y }, thickness: 0.5, color: RULE_COLOR });
  }
  page.drawLine({
    start: { x: MARGIN_L - 12, y: PAGE_H - 16 },
    end: { x: MARGIN_L - 12, y: 24 },
    thickness: 1,
    color: rgb(0.89, 0.47, 0.42),
    opacity: 0.55,
  });
}

function centerText(
  page: import("pdf-lib").PDFPage,
  text: string,
  font: import("pdf-lib").PDFFont,
  size: number,
  y: number,
  color: ReturnType<typeof rgb>
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (PAGE_W - w) / 2, y, size, font, color });
}

function fitFontSize(text: string, font: import("pdf-lib").PDFFont, maxSize: number, maxWidth: number): number {
  let size = maxSize;
  while (size > 9 && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  return size;
}

interface Span {
  text: string;
  color?: Highlight["color"];
}

function wrapWithHighlights(
  text: string,
  font: import("pdf-lib").PDFFont,
  size: number,
  maxWidth: number,
  highlights?: Highlight[]
): Span[][] {
  const ranges: { start: number; end: number; color: Highlight["color"] }[] = [];
  if (highlights) {
    for (const h of highlights) {
      const idx = text.toLowerCase().indexOf(h.text.toLowerCase());
      if (idx !== -1) ranges.push({ start: idx, end: idx + h.text.length, color: h.color });
    }
  }
  const colorAt = (i: number) => ranges.find((r) => i >= r.start && i < r.end)?.color;

  const words = text.split(" ");
  const lines: Span[][] = [];
  let current: Span[] = [];
  let currentWidth = 0;
  let charIdx = 0;

  for (const word of words) {
    const wordStart = charIdx;
    charIdx += word.length + 1;
    const span: Span = { text: word, color: colorAt(wordStart) };
    const wWidth = font.widthOfTextAtSize(word + " ", size);
    if (currentWidth + wWidth > maxWidth && current.length) {
      lines.push(current);
      current = [];
      currentWidth = 0;
    }
    current.push(span);
    currentWidth += wWidth;
  }
  if (current.length) lines.push(current);
  return lines;
}

function drawSpans(
  page: import("pdf-lib").PDFPage,
  spans: Span[],
  font: import("pdf-lib").PDFFont,
  size: number,
  x: number,
  y: number
) {
  let cx = x;
  for (const span of spans) {
    const label = span.text + " ";
    const w = font.widthOfTextAtSize(label, size);
    if (span.color) {
      const c = HIGHLIGHT_HEX[span.color];
      page.drawRectangle({
        x: cx - 1,
        y: y - 3,
        width: font.widthOfTextAtSize(span.text, size) + 2,
        height: size + 4,
        color: rgb(c.r, c.g, c.b),
        opacity: 0.7,
      });
    }
    page.drawText(span.text, { x: cx, y, size, font, color: INK });
    cx += w;
  }
}

function wrapText(text: string, font: import("pdf-lib").PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = trial;
    }
  }
  if (current) lines.push(current);
  return lines;
}
