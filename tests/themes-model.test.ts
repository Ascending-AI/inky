import { describe, expect, it } from "vitest";
import { BOOK, BUILT_IN, DARK, LIGHT } from "../src/lib/themes/builtin";
import {
  THEME_PROPS,
  parseTheme,
  resolveTheme,
  serializeTheme,
  type Theme,
} from "../src/lib/themes/model";

// Literal copies of the old :root / .dark / .book blocks in src/app.css at
// commit 0354808 (Book falls back to :root for what .book never set).
const LIGHT_FIXTURE: Record<string, string> = {
  "--background": "oklch(1 0 0)",
  "--foreground": "oklch(0.141 0.005 285.823)",
  "--prose-link": "oklch(0.488 0.217 264.052)",
  "--sidebar": "oklch(0.985 0 0)",
  "--border": "oklch(0.92 0.004 286.32)",
  "--muted-foreground": "oklch(0.552 0.016 285.938)",
  "--accent": "oklch(0.967 0.001 286.375)",
  "--muted": "oklch(0.967 0.001 286.375)",
  "--prose-code-bg": "oklch(0.96 0.004 286.32)",
  "--prose-quote-border": "oklch(0.87 0.006 286.32)",
  "--editor-selection": "oklch(0.62 0.19 260 / 22%)",
  "--comment-mark": "rgb(250 204 21)",
  "--tab-strip": "color-mix(in oklab, var(--foreground) 3.5%, var(--background))",
  "--card": "oklch(1 0 0)",
  "--card-foreground": "oklch(0.141 0.005 285.823)",
  "--popover": "oklch(1 0 0)",
  "--popover-foreground": "oklch(0.141 0.005 285.823)",
  "--primary": "oklch(0.21 0.006 285.885)",
  "--primary-foreground": "oklch(0.985 0 0)",
  "--secondary": "oklch(0.967 0.001 286.375)",
  "--secondary-foreground": "oklch(0.21 0.006 285.885)",
  "--accent-foreground": "oklch(0.21 0.006 285.885)",
  "--destructive": "oklch(0.577 0.245 27.325)",
  "--destructive-foreground": "oklch(0.985 0 0)",
  "--input": "oklch(0.92 0.004 286.32)",
  "--ring": "oklch(0.705 0.015 286.067)",
  "--sidebar-foreground": "oklch(0.141 0.005 285.823)",
  "--sidebar-border": "oklch(0.92 0.004 286.32)",
  "--comment-line": "rgb(202 138 4)",
  "--hl-comment": "#6a737d",
  "--hl-keyword": "#d73a49",
  "--hl-string": "#032f62",
  "--hl-title": "#6f42c1",
  "--hl-number": "#005cc5",
  "--hl-attr": "#22863a",
};

const DARK_FIXTURE: Record<string, string> = {
  "--background": "oklch(0.245 0.006 264)",
  "--foreground": "oklch(0.95 0.004 264)",
  "--prose-link": "oklch(0.707 0.165 254.624)",
  "--sidebar": "oklch(0.27 0.006 264)",
  "--border": "oklch(1 0 0 / 13%)",
  "--muted-foreground": "oklch(0.72 0.012 264)",
  "--accent": "oklch(0.34 0.007 264)",
  "--muted": "oklch(0.32 0.006 264)",
  "--prose-code-bg": "oklch(0.3 0.006 264)",
  "--prose-quote-border": "oklch(0.42 0.008 264)",
  "--editor-selection": "oklch(0.62 0.19 260 / 38%)",
  "--comment-mark": "rgb(250 204 21)",
  "--tab-strip": "color-mix(in oklab, black 12%, var(--background))",
  "--card": "oklch(0.285 0.006 264)",
  "--card-foreground": "oklch(0.95 0.004 264)",
  "--popover": "oklch(0.285 0.006 264)",
  "--popover-foreground": "oklch(0.95 0.004 264)",
  "--primary": "oklch(0.92 0.004 286.32)",
  "--primary-foreground": "oklch(0.245 0.006 264)",
  "--secondary": "oklch(0.32 0.006 264)",
  "--secondary-foreground": "oklch(0.95 0.004 264)",
  "--accent-foreground": "oklch(0.95 0.004 264)",
  "--destructive": "oklch(0.704 0.191 22.216)",
  "--destructive-foreground": "oklch(0.95 0.004 264)",
  "--input": "oklch(1 0 0 / 17%)",
  "--ring": "oklch(0.58 0.014 264)",
  "--sidebar-foreground": "oklch(0.95 0.004 264)",
  "--sidebar-border": "oklch(1 0 0 / 11%)",
  "--comment-line": "rgb(202 138 4)",
  "--hl-comment": "#8b949e",
  "--hl-keyword": "#ff7b72",
  "--hl-string": "#a5d6ff",
  "--hl-title": "#d2a8ff",
  "--hl-number": "#79c0ff",
  "--hl-attr": "#7ee787",
};

const BOOK_FIXTURE: Record<string, string> = {
  "--background": "oklch(0.955 0.018 84)",
  "--foreground": "oklch(0.3 0.03 60)",
  "--prose-link": "oklch(0.45 0.1 40)",
  "--sidebar": "oklch(0.935 0.02 84)",
  "--border": "oklch(0.87 0.02 80)",
  "--muted-foreground": "oklch(0.5 0.03 60)",
  "--accent": "oklch(0.89 0.025 80)",
  "--muted": "oklch(0.91 0.02 84)",
  "--prose-code-bg": "oklch(0.9 0.02 84)",
  "--prose-quote-border": "oklch(0.8 0.03 80)",
  "--editor-selection": "oklch(0.78 0.09 85 / 50%)",
  "--comment-mark": "rgb(250 204 21)",
  "--tab-strip": "color-mix(in oklab, var(--foreground) 3.5%, var(--background))",
  "--card": "oklch(0.97 0.014 84)",
  "--card-foreground": "oklch(0.3 0.03 60)",
  "--popover": "oklch(0.97 0.014 84)",
  "--popover-foreground": "oklch(0.3 0.03 60)",
  "--primary": "oklch(0.42 0.06 50)",
  "--primary-foreground": "oklch(0.97 0.014 84)",
  "--secondary": "oklch(0.91 0.02 84)",
  "--secondary-foreground": "oklch(0.35 0.04 55)",
  "--accent-foreground": "oklch(0.32 0.04 55)",
  "--destructive": "oklch(0.55 0.2 28)",
  "--destructive-foreground": "oklch(0.97 0.014 84)",
  "--input": "oklch(0.87 0.02 80)",
  "--ring": "oklch(0.6 0.05 60)",
  "--sidebar-foreground": "oklch(0.3 0.03 60)",
  "--sidebar-border": "oklch(0.87 0.02 80)",
  "--comment-line": "rgb(202 138 4)",
  "--hl-comment": "#8a7a66",
  "--hl-keyword": "#a0430a",
  "--hl-string": "#5c661f",
  "--hl-title": "#7d4a9e",
  "--hl-number": "#14657f",
  "--hl-attr": "#3f6d34",
};

const min: Theme = {
  id: "min",
  name: "Min",
  kind: "light",
  colors: { page: "#ffffff", text: "#222222", accent: "#0000ff", sidebar: "#f5f5f5", border: "#dddddd" },
};
const minDark: Theme = { ...min, id: "mind", kind: "dark" };

const file = (over: Record<string, unknown> = {}, colors: Record<string, unknown> = {}) =>
  JSON.stringify({
    inkyTheme: 1,
    id: "x",
    name: "X",
    kind: "light",
    colors: { ...min.colors, ...colors },
    ...over,
  });

describe("built-ins", () => {
  it("built-ins resolve to today's colours", () => {
    expect(resolveTheme(LIGHT)).toEqual(LIGHT_FIXTURE);
    expect(resolveTheme(DARK)).toEqual(DARK_FIXTURE);
    expect(resolveTheme(BOOK)).toEqual(BOOK_FIXTURE);
    expect(BUILT_IN).toEqual([LIGHT, DARK, BOOK]);
  });
});

describe("resolveTheme", () => {
  it("a theme with only the main colours resolves every property", () => {
    const r = resolveTheme(min);
    expect(new Set(Object.keys(r))).toEqual(new Set(THEME_PROPS));
    expect(r["--muted-foreground"]).toBe("color-mix(in oklab, #222222 58%, #ffffff)");
  });

  it("explicit colours win over derived ones", () => {
    const r = resolveTheme({ ...min, colors: { ...min.colors, hover: "#123456" } });
    expect(r["--accent"]).toBe("#123456");
  });

  it("kind picks the derived tab strip, destructive and syntax colours", () => {
    const r = resolveTheme(minDark);
    expect(r["--hl-keyword"]).toBe(resolveTheme(DARK)["--hl-keyword"]);
    expect(r["--tab-strip"].startsWith("color-mix(in oklab, black 12%")).toBe(true);
    expect(r["--destructive"]).toBe("#f87171");
    expect(resolveTheme(min)["--destructive"]).toBe("#dc2626");
  });
});

describe("parseTheme", () => {
  const rejects = (json: string, cause: string) => {
    const r = parseTheme(json);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(cause);
  };

  it("rejects what is not JSON", () => rejects("{nope", "JSON"));
  it("rejects a bad version", () => rejects(file({ inkyTheme: 2 }), "version"));
  it("rejects a bad kind", () => rejects(file({ kind: "sepia" }), "kind"));
  it("rejects a missing main colour", () => {
    const c: Record<string, unknown> = { ...min.colors };
    delete c.accent;
    rejects(JSON.stringify({ inkyTheme: 1, id: "x", name: "X", kind: "light", colors: c }), "accent");
  });
  it("rejects an invalid main colour", () => rejects(file({}, { page: "notacolor" }), "page"));
  it("rejects a missing name", () => rejects(file({ name: undefined }), "name"));

  it("drops a bad optional colour with a warning", () => {
    const r = parseTheme(file({}, { hover: "nope" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect("hover" in r.theme.colors).toBe(false);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toContain("hover");
    }
  });

  it("ignores unknown keys", () => {
    const r = parseTheme(file({ extra: 1, ui: { bogus: "#fff" } }, { sparkle: "#fff" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.theme.colors).toEqual(min.colors);
      expect(r.theme.ui).toBeUndefined();
    }
  });

  it("keeps basedOn", () => {
    const r = parseTheme(file({ basedOn: "dark" }));
    expect(r.ok && r.basedOn).toBe("dark");
  });

  it("gives a missing id an empty id", () => {
    const r = parseTheme(file({ id: undefined }));
    expect(r.ok && r.theme.id).toBe("");
  });
});

describe("serializeTheme", () => {
  it("serialize → parse round-trips", () => {
    for (const t of [LIGHT, min]) {
      const r = parseTheme(serializeTheme(t, { basedOn: "light" }));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.theme).toEqual(t);
        expect(r.basedOn).toBe("light");
      }
    }
  });

  it("writes the version first and omits empty groups", () => {
    const s = serializeTheme(min);
    expect(s.startsWith('{\n  "inkyTheme": 1,')).toBe(true);
    expect(s).not.toContain('"ui"');
    expect(s).not.toContain('"syntax"');
  });
});
