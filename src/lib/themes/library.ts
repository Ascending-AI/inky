/**
 * Pure logic for the theme library: ids and names for saved themes, the
 * editing rules behind Custom, and the ordering of the theme list.
 */
import { BUILT_IN, LIGHT } from "./builtin";
import { READY_MADE } from "./readymade";
import {
  MAIN_KEYS,
  parseTheme,
  serializeTheme,
  type ExactColors,
  type MainColors,
  type Theme,
  type ThemeKind,
} from "./model";

const RESERVED = new Set(["light", "dark", "book", "custom"]);

/** Which section of the theme list an id belongs to. */
export type ThemeGroup = "builtin" | "readymade" | "yours" | "custom";

export function themeGroup(id: string): ThemeGroup {
  if (id === "custom") return "custom";
  if (id.startsWith("rm-")) return "readymade";
  if (BUILT_IN.some((t) => t.id === id)) return "builtin";
  return "yours";
}

/** A valid, unused id for a saved theme: lowercase ASCII slug of the name. */
export function slugFor(name: string, taken: Set<string>): string {
  let base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  if (!base) base = "theme";
  if (base.startsWith("rm-")) base = `my-${base}`.slice(0, 48).replace(/-+$/g, "");
  const free = (s: string) => !taken.has(s) && !RESERVED.has(s);
  if (free(base)) return base;
  for (let n = 2; ; n++) {
    const s = `${base}-${n}`;
    if (free(s)) return s;
  }
}

/** The trimmed name, with " 2", " 3"… appended until no name matches it ignoring case. */
export function uniqueName(name: string, existing: string[]): string {
  const base = name.trim();
  const lower = new Set(existing.map((n) => n.trim().toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const s = `${base} ${n}`;
    if (!lower.has(s.toLowerCase())) return s;
  }
}

export interface EditState {
  start: Theme;
  mains: MainColors;
  kind: ThemeKind;
  /** Optional colours the user set by hand; they survive re-derivation. */
  pinned: Partial<ExactColors>;
  /** A main colour or the kind has changed, so unpinned colours re-derive. */
  mainsTouched: boolean;
}

export function beginEdit(start: Theme): EditState {
  const mains = {} as MainColors;
  for (const k of MAIN_KEYS) mains[k] = start.colors[k];
  return { start, mains, kind: start.kind, pinned: {}, mainsTouched: false };
}

/** The Custom theme an edit state describes. */
export function editedTheme(s: EditState): Theme {
  if (!s.mainsTouched) {
    const t: Theme = {
      id: "custom",
      name: "Custom",
      kind: s.start.kind,
      colors: { ...s.start.colors, ...s.pinned },
    };
    if (s.start.ui) t.ui = { ...s.start.ui };
    if (s.start.syntax) t.syntax = { ...s.start.syntax };
    return t;
  }
  return { id: "custom", name: "Custom", kind: s.kind, colors: { ...s.mains, ...s.pinned } };
}

export function customFile(t: Theme, basedOn: string): string {
  return serializeTheme(t, { basedOn });
}

/** The active theme, or Light (and `missing`) when its id is not in the list. */
export function activeOrFallback(themes: readonly Theme[], id: string): { theme: Theme; missing: boolean } {
  const found = themes.find((t) => t.id === id);
  if (found) return { theme: found, missing: false };
  return { theme: themes.find((t) => t.id === "light") ?? LIGHT, missing: true };
}

/** Built-ins, ready-made, yours sorted by name, then Custom. */
export function orderThemes(themes: readonly Theme[]): Theme[] {
  const yours = themes
    .filter((t) => themeGroup(t.id) === "yours")
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const custom = themes.filter((t) => t.id === "custom");
  return [...BUILT_IN, ...READY_MADE, ...yours, ...custom];
}

export interface LoadedThemes {
  yours: Theme[];
  custom: Theme | null;
  customBasedOn: string | null;
  warnings: string[];
}

const VALID_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Clean the theme files read from disk. The file name (stem) is the id,
 * whatever the file says; unusable ids and invalid files are skipped with a
 * warning; names that clash with another theme get " 2", " 3"… appended.
 */
export function loadThemeFiles(files: readonly { id: string; json: string }[]): LoadedThemes {
  const out: LoadedThemes = { yours: [], custom: null, customBasedOn: null, warnings: [] };
  const names = [...BUILT_IN, ...READY_MADE].map((t) => t.name);
  names.push("Custom");
  const ids = new Set<string>([...BUILT_IN, ...READY_MADE].map((t) => t.id));
  for (const f of files) {
    const r = parseTheme(f.json);
    if (!r.ok) {
      out.warnings.push(`Skipped ${f.id}.json: ${r.error}`);
      continue;
    }
    if (f.id === "custom") {
      out.custom = { ...r.theme, id: "custom", name: "Custom" };
      out.customBasedOn = r.basedOn ?? null;
      continue;
    }
    if (!VALID_ID.test(f.id) || themeGroup(f.id) !== "yours" || ids.has(f.id)) {
      out.warnings.push(`Skipped ${f.id}.json: unusable theme id`);
      continue;
    }
    ids.add(f.id);
    const name = uniqueName(r.theme.name, names);
    names.push(name);
    out.yours.push({ ...r.theme, id: f.id, name });
  }
  return out;
}
