/**
 * WCAG contrast checks for the theme editor: body text on page, link on page,
 * sidebar text on sidebar. Pure; colour resolution is passed in.
 */
import { resolveTheme, type Theme } from "./model";

/** Contrast below this (WCAG AA for body text) earns a warning. */
export const MIN_CONTRAST = 4.5;

type Rgba = [number, number, number, number];

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` to 0–255 channels and 0–1 alpha. */
function parseHex(hex: string): Rgba | null {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratioOf(fg: Rgba, bg: Rgba): number {
  // A translucent foreground shows the background through it.
  const a = fg[3];
  const ch = (i: number) => fg[i] * a + bg[i] * (1 - a);
  const l1 = luminance([ch(0), ch(1), ch(2), 1]);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** WCAG contrast ratio of `a` on `b` (hex colours; `a`'s alpha is composited over `b`). NaN when unreadable. */
export function contrastRatio(a: string, b: string): number {
  const fg = parseHex(a);
  const bg = parseHex(b);
  if (!fg || !bg) return NaN;
  return ratioOf(fg, bg);
}

export type ContrastKey = "text" | "accent" | "sidebar";

const PAIRS: { key: ContrastKey; fg: string; bg: string }[] = [
  { key: "text", fg: "--foreground", bg: "--background" },
  { key: "accent", fg: "--prose-link", bg: "--background" },
  { key: "sidebar", fg: "--sidebar-foreground", bg: "--sidebar" },
];

/**
 * The checked pairs that fall below 4.5:1. A pair whose colours `resolve`
 * cannot turn into hex (`var()` in a built-in, say) is skipped, not flagged.
 */
export function contrastIssues(
  theme: Theme,
  resolve: (css: string) => string | null,
): { key: ContrastKey; ratio: number }[] {
  const props = resolveTheme(theme);
  const out: { key: ContrastKey; ratio: number }[] = [];
  for (const p of PAIRS) {
    const fg = resolve(props[p.fg]);
    const bg = resolve(props[p.bg]);
    if (!fg || !bg) continue;
    const ratio = contrastRatio(fg, bg);
    if (Number.isFinite(ratio) && ratio < MIN_CONTRAST) out.push({ key: p.key, ratio });
  }
  return out;
}
