/**
 * The colour theme model: what a theme is, how a theme file is validated, and
 * how a theme turns into CSS custom properties. Pure data and functions, no DOM
 * writes: applying the result to the page is somebody else's job.
 *
 * A theme is five main colours plus optional finer keys. Whatever a theme does
 * not say is derived from the main five and its kind (light or dark), so a
 * five-colour theme still styles every surface.
 */

export type ThemeKind = "light" | "dark";

// Key order below is the order of the mapping table; serialisation and tests
// rely on it.
export const MAIN_KEYS = ["page", "text", "accent", "sidebar", "border"] as const;
export const EXACT_KEYS = [
  "mutedText",
  "hover",
  "tableHeader",
  "inlineCode",
  "quoteBar",
  "selection",
  "commentMark",
  "tabStrip",
] as const;
export const UI_KEYS = [
  "card",
  "cardText",
  "popover",
  "popoverText",
  "primary",
  "primaryText",
  "secondary",
  "secondaryText",
  "hoverText",
  "destructive",
  "destructiveText",
  "input",
  "ring",
  "sidebarText",
  "sidebarBorder",
  "commentLine",
] as const;
export const SYNTAX_KEYS = ["comment", "keyword", "string", "title", "number", "attr"] as const;

export type MainKey = (typeof MAIN_KEYS)[number];
export type ExactKey = (typeof EXACT_KEYS)[number];
export type UiKey = (typeof UI_KEYS)[number];
export type SyntaxKey = (typeof SYNTAX_KEYS)[number];

export type MainColors = Record<MainKey, string>;
export type ExactColors = Record<ExactKey, string>;
export type UiColors = Record<UiKey, string>;
export type SyntaxColors = Record<SyntaxKey, string>;

export interface Theme {
  id: string;
  name: string;
  kind: ThemeKind;
  colors: MainColors & Partial<ExactColors>;
  ui?: Partial<UiColors>;
  syntax?: Partial<SyntaxColors>;
}

export type ParseResult =
  | { ok: true; theme: Theme; basedOn?: string; warnings: string[] }
  | { ok: false; error: string };

const MAIN_PROP: Record<MainKey, string> = {
  page: "--background",
  text: "--foreground",
  accent: "--prose-link",
  sidebar: "--sidebar",
  border: "--border",
};
const EXACT_PROP: Record<ExactKey, string> = {
  mutedText: "--muted-foreground",
  hover: "--accent",
  tableHeader: "--muted",
  inlineCode: "--prose-code-bg",
  quoteBar: "--prose-quote-border",
  selection: "--editor-selection",
  commentMark: "--comment-mark",
  tabStrip: "--tab-strip",
};
const UI_PROP: Record<UiKey, string> = {
  card: "--card",
  cardText: "--card-foreground",
  popover: "--popover",
  popoverText: "--popover-foreground",
  primary: "--primary",
  primaryText: "--primary-foreground",
  secondary: "--secondary",
  secondaryText: "--secondary-foreground",
  hoverText: "--accent-foreground",
  destructive: "--destructive",
  destructiveText: "--destructive-foreground",
  input: "--input",
  ring: "--ring",
  sidebarText: "--sidebar-foreground",
  sidebarBorder: "--sidebar-border",
  commentLine: "--comment-line",
};
const syntaxProp = (k: SyntaxKey) => `--hl-${k}`;

/** Every custom property a theme sets. `color-scheme` is set from `kind` elsewhere. */
export const THEME_PROPS: readonly string[] = [
  ...MAIN_KEYS.map((k) => MAIN_PROP[k]),
  ...EXACT_KEYS.map((k) => EXACT_PROP[k]),
  ...UI_KEYS.map((k) => UI_PROP[k]),
  ...SYNTAX_KEYS.map(syntaxProp),
];

// Fallback syntax palettes, so a theme that names no syntax colours still
// reads well. These equal the built-in Light and Dark sets.
const SYNTAX_LIGHT: SyntaxColors = {
  comment: "#6a737d",
  keyword: "#d73a49",
  string: "#032f62",
  title: "#6f42c1",
  number: "#005cc5",
  attr: "#22863a",
};
const SYNTAX_DARK: SyntaxColors = {
  comment: "#8b949e",
  keyword: "#ff7b72",
  string: "#a5d6ff",
  title: "#d2a8ff",
  number: "#79c0ff",
  attr: "#7ee787",
};

const mix = (a: string, pct: number | string, b: string) => `color-mix(in oklab, ${a} ${pct}%, ${b})`;

/** The exact colours as derived from the main five and kind alone. */
export function deriveExact(t: Theme): ExactColors {
  const { page: P, text: T, accent: A } = t.colors;
  return {
    mutedText: mix(T, 58, P),
    hover: mix(T, 7, P),
    tableHeader: mix(T, 4, P),
    inlineCode: mix(T, 6, P),
    quoteBar: mix(T, 20, P),
    selection: mix(A, 28, "transparent"),
    commentMark: "rgb(250 204 21)",
    tabStrip: t.kind === "dark" ? mix("black", 12, P) : mix(T, 3.5, P),
  };
}

/** A value for every property in THEME_PROPS: explicit values first, derived otherwise. */
export function resolveTheme(t: Theme): Record<string, string> {
  const { page: P, text: T, accent: A, border: B } = t.colors;
  const exact = { ...deriveExact(t) };
  for (const k of EXACT_KEYS) {
    const v = t.colors[k];
    if (v !== undefined) exact[k] = v;
  }
  const ui: UiColors = {
    card: P,
    cardText: T,
    popover: P,
    popoverText: T,
    primary: T,
    primaryText: P,
    secondary: exact.tableHeader,
    secondaryText: T,
    hoverText: T,
    destructive: t.kind === "dark" ? "#f87171" : "#dc2626",
    destructiveText: P,
    input: B,
    ring: mix(A, 60, P),
    sidebarText: T,
    sidebarBorder: B,
    commentLine: mix(exact.commentMark, 75, "black"),
    ...t.ui,
  };
  const syntax: SyntaxColors = { ...(t.kind === "dark" ? SYNTAX_DARK : SYNTAX_LIGHT), ...t.syntax };

  const out: Record<string, string> = {};
  for (const k of MAIN_KEYS) out[MAIN_PROP[k]] = t.colors[k];
  for (const k of EXACT_KEYS) out[EXACT_PROP[k]] = exact[k];
  for (const k of UI_KEYS) out[UI_PROP[k]] = ui[k];
  for (const k of SYNTAX_KEYS) out[syntaxProp(k)] = syntax[k];
  return out;
}

const COLOR_FN = /^(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color-mix|color)\(.+\)$/i;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function defaultIsColor(v: string): boolean {
  const s = v.trim();
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
    return CSS.supports("color", s);
  }
  return HEX.test(s) || COLOR_FN.test(s);
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Parse and validate a theme file. Hand-edited files get a clear rejection
 * (bad version, kind, missing or invalid main colour) or, for optional keys,
 * a warning and the key dropped. Unknown keys are ignored.
 */
export function parseTheme(json: string, isColor: (v: string) => boolean = defaultIsColor): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "Not valid JSON" };
  }
  if (!isObj(raw)) return { ok: false, error: "Not a theme: expected a JSON object" };
  if (raw.inkyTheme !== 1) return { ok: false, error: "Unsupported theme version (expected inkyTheme: 1)" };
  if (typeof raw.name !== "string" || raw.name.trim() === "") {
    return { ok: false, error: "Theme is missing a name" };
  }
  if (raw.kind !== "light" && raw.kind !== "dark") {
    return { ok: false, error: 'Theme kind must be "light" or "dark"' };
  }
  if (!isObj(raw.colors)) return { ok: false, error: "Theme is missing colors" };

  const warnings: string[] = [];
  const main: Partial<MainColors> = {};
  for (const k of MAIN_KEYS) {
    const v = raw.colors[k];
    if (typeof v !== "string") return { ok: false, error: `Missing main colour: ${k}` };
    if (!isColor(v)) return { ok: false, error: `Invalid colour for ${k}: ${v}` };
    main[k] = v;
  }

  const pick = <K extends string>(group: unknown, keys: readonly K[], label: string): Partial<Record<K, string>> => {
    const out: Partial<Record<K, string>> = {};
    if (!isObj(group)) return out;
    for (const k of keys) {
      const v = group[k];
      if (v === undefined) continue;
      if (typeof v === "string" && isColor(v)) out[k] = v;
      else warnings.push(`Ignored invalid colour for ${label}${k}`);
    }
    return out;
  };

  const colors = { ...(main as MainColors), ...pick(raw.colors, EXACT_KEYS, "") };
  const ui = pick(raw.ui, UI_KEYS, "ui.");
  const syntax = pick(raw.syntax, SYNTAX_KEYS, "syntax.");

  const theme: Theme = {
    id: typeof raw.id === "string" ? raw.id : "",
    name: raw.name.trim(),
    kind: raw.kind,
    colors,
  };
  if (Object.keys(ui).length) theme.ui = ui;
  if (Object.keys(syntax).length) theme.syntax = syntax;
  const basedOn = typeof raw.basedOn === "string" ? raw.basedOn : undefined;
  return { ok: true, theme, ...(basedOn !== undefined ? { basedOn } : {}), warnings };
}

/** Theme file text: 2-space JSON, version first, empty groups omitted. */
export function serializeTheme(t: Theme, extra?: { basedOn?: string }): string {
  const obj: Record<string, unknown> = { inkyTheme: 1, id: t.id, name: t.name, kind: t.kind };
  if (extra?.basedOn) obj.basedOn = extra.basedOn;
  obj.colors = t.colors;
  if (t.ui && Object.keys(t.ui).length) obj.ui = t.ui;
  if (t.syntax && Object.keys(t.syntax).length) obj.syntax = t.syntax;
  return JSON.stringify(obj, null, 2);
}
