/**
 * Reader highlights: fluorescent marks on quoted text, with an optional
 * note. Anchored like comments (quote + surrounding context, see
 * $lib/comments), so they survive edits elsewhere in the document. Stored
 * per document path in one file in the app's data folder.
 */

import type { TextAnchor } from "./comments";

/** Highlighter-pen colours; light enough for dark text to stay readable. */
export const HIGHLIGHT_COLORS = {
  yellow: { label: "Yellow", value: "#fff200" },
  green: { label: "Green", value: "#4dff3a" },
  pink: { label: "Pink", value: "#ff52d9" },
  blue: { label: "Blue", value: "#2ee6ff" },
  orange: { label: "Orange", value: "#ffa31a" },
  purple: { label: "Purple", value: "#c98bff" },
} as const;

export type HighlightColor = keyof typeof HIGHLIGHT_COLORS;
export const COLOR_KEYS = Object.keys(HIGHLIGHT_COLORS) as HighlightColor[];

export interface Highlight extends TextAnchor {
  id: string;
  color: HighlightColor;
  /** The reader's own note; empty when there is none. */
  note: string;
  /** The quote as read, without footnote markers (for lists and export);
   *  absent when it equals `quote`. */
  text?: string;
  createdAt: string;
}

/** Highlights by document path. */
export type HighlightStore = Record<string, Highlight[]>;

export function isColor(c: unknown): c is HighlightColor {
  return typeof c === "string" && c in HIGHLIGHT_COLORS;
}

/** Parse the stored file, dropping anything malformed instead of failing. */
export function parseStore(raw: string): HighlightStore {
  let data: unknown;
  try {
    data = JSON.parse(raw || "{}");
  } catch {
    return {};
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out: HighlightStore = {};
  for (const [path, list] of Object.entries(data as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const valid = list.filter(
      (h): h is Highlight =>
        !!h &&
        typeof h.id === "string" &&
        typeof h.quote === "string" &&
        h.quote.length > 0 &&
        isColor(h.color),
    );
    const clean = valid.map((h) => ({
      ...h,
      prefix: typeof h.prefix === "string" ? h.prefix : "",
      suffix: typeof h.suffix === "string" ? h.suffix : "",
      note: typeof h.note === "string" ? h.note : "",
      text: typeof h.text === "string" && h.text ? h.text : undefined,
      createdAt: typeof h.createdAt === "string" ? h.createdAt : new Date(0).toISOString(),
    }));
    if (clean.length) out[path] = clean;
  }
  return out;
}

const within = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

/** A file or folder moved: carry its documents' highlights along. */
export function remapStore(store: HighlightStore, from: string, to: string): boolean {
  let changed = false;
  for (const path of Object.keys(store)) {
    if (within(path, from)) {
      store[to + path.slice(from.length)] = store[path];
      delete store[path];
      changed = true;
    }
  }
  return changed;
}

export function forgetInStore(store: HighlightStore, prefix: string): boolean {
  let changed = false;
  for (const path of Object.keys(store)) {
    if (within(path, prefix)) {
      delete store[path];
      changed = true;
    }
  }
  return changed;
}

/** The highlighted text as the reader sees it, whitespace collapsed. */
export function shownText(h: Highlight): string {
  return (h.text ?? h.quote).replace(/\s+/g, " ").trim();
}

/** A selection's text without footnote markers ("grading.³⁴" → "grading."). */
export function readableText(range: Range): string {
  const box = document.createElement("div");
  box.appendChild(range.cloneContents());
  box.querySelectorAll("sup:has(a[data-footnote-ref]), a[data-footnote-ref]").forEach((n) => n.remove());
  return box.textContent ?? "";
}

/** Highlights as a Markdown digest: quotes (with colour and note) per document. */
export function highlightsToMarkdown(
  groups: { title: string; highlights: Highlight[] }[],
): string {
  const parts: string[] = [];
  for (const { title, highlights } of groups) {
    if (!highlights.length) continue;
    parts.push(`## ${title}`, "");
    for (const h of highlights) {
      const quote = shownText(h);
      parts.push(`> ${quote}`, ">", `> — ${HIGHLIGHT_COLORS[h.color].label.toLowerCase()} highlight`);
      if (h.note.trim()) parts.push("", h.note.trim());
      parts.push("");
    }
  }
  return parts.join("\n").trim() + "\n";
}
