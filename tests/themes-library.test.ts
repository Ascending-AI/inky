import { describe, expect, it } from "vitest";
import { BUILT_IN, DARK, LIGHT } from "../src/lib/themes/builtin";
import {
  activeOrFallback,
  beginEdit,
  customFile,
  editedTheme,
  loadThemeFiles,
  replaceTarget,
  slugFor,
  uniqueName,
  withCustom,
} from "../src/lib/themes/library";
import { parseTheme, type Theme } from "../src/lib/themes/model";
import { READY_MADE } from "../src/lib/themes/readymade";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

describe("slugFor", () => {
  it("slugs a plain name", () => {
    expect(slugFor("Ocean Breeze", new Set())).toBe("ocean-breeze");
  });
  it("falls back to theme for emoji-only names", () => {
    expect(slugFor("🌊🌊", new Set())).toBe("theme");
  });
  it("adds a numeric suffix when taken", () => {
    expect(slugFor("Ocean Breeze", new Set(["ocean-breeze"]))).toBe("ocean-breeze-2");
    expect(slugFor("Ocean Breeze", new Set(["ocean-breeze", "ocean-breeze-2"]))).toBe("ocean-breeze-3");
  });
  it("never yields reserved ids or the rm- prefix", () => {
    for (const n of ["Light", "DARK", "book", "Custom", "rm-foo", "RM Foo"]) {
      const s = slugFor(n, new Set());
      expect(["light", "dark", "book", "custom"]).not.toContain(s);
      expect(s.startsWith("rm-")).toBe(false);
      expect(s).toMatch(ID);
    }
  });
  it("caps long names at 48 characters plus suffix", () => {
    const s = slugFor("a".repeat(200), new Set());
    expect(s.length).toBeLessThanOrEqual(48);
    const t = slugFor("a".repeat(200), new Set([s]));
    expect(t.length).toBeLessThanOrEqual(52);
    expect(t).toMatch(ID);
  });
  it("handles punctuation-heavy names", () => {
    expect(slugFor("--!!Hello, World!!--", new Set())).toBe("hello-world");
  });
});

describe("uniqueName", () => {
  it("appends a number on case-insensitive clash", () => {
    expect(uniqueName("fjord", ["Fjord"])).toBe("fjord 2");
    expect(uniqueName("fjord", ["Fjord", "fjord 2"])).toBe("fjord 3");
  });
  it("avoids built-in names", () => {
    expect(uniqueName("Dark", BUILT_IN.map((t) => t.name))).toBe("Dark 2");
  });
  it("trims", () => {
    expect(uniqueName("  Sea  ", [])).toBe("Sea");
  });
});

describe("editedTheme", () => {
  it("before touching mains equals the start colours with pins", () => {
    const s = beginEdit(DARK);
    expect(editedTheme(s).colors).toEqual(DARK.colors);
    expect(editedTheme(s).ui).toEqual(DARK.ui);
    expect(editedTheme(s).syntax).toEqual(DARK.syntax);
    s.pinned = { hover: "red" };
    const t = editedTheme(s);
    expect(t.colors.hover).toBe("red");
    expect(t.colors.mutedText).toBe(DARK.colors.mutedText);
    expect(t.id).toBe("custom");
    expect(t.name).toBe("Custom");
    expect(t.kind).toBe("dark");
  });
  it("after changing a main colour, unpinned exact colours, ui and syntax are dropped", () => {
    const s = beginEdit(LIGHT);
    s.mains = { ...s.mains, page: "#fafafa" };
    s.mainsTouched = true;
    s.pinned = { quoteBar: "#123456" };
    const t = editedTheme(s);
    expect(t.colors.page).toBe("#fafafa");
    expect(t.colors.quoteBar).toBe("#123456");
    expect(t.colors.mutedText).toBeUndefined();
    expect(t.colors.hover).toBeUndefined();
    expect(t.ui).toBeUndefined();
    expect(t.syntax).toBeUndefined();
  });
  it("customFile round-trips with basedOn", () => {
    const r = parseTheme(customFile(editedTheme(beginEdit(LIGHT)), "ocean"));
    expect(r.ok && r.basedOn).toBe("ocean");
  });
});

describe("activeOrFallback", () => {
  it("falls back to light when the active theme is missing", () => {
    const r = activeOrFallback([...BUILT_IN], "gone");
    expect(r.missing).toBe(true);
    expect(r.theme.id).toBe("light");
    const ok = activeOrFallback([...BUILT_IN], "dark");
    expect(ok.missing).toBe(false);
    expect(ok.theme.id).toBe("dark");
  });
});

describe("loadThemeFiles", () => {
  const file = (id: string, name: string, extra = "") =>
    ({ id, json: `{"inkyTheme":1,"id":"${id}","name":"${name}","kind":"light",${extra}"colors":{"page":"#fff","text":"#000","accent":"#00f","sidebar":"#eee","border":"#ddd"}}` });
  it("renames a name that clashes with a built-in or an earlier file", () => {
    const r = loadThemeFiles([file("a", "Dark"), file("b", "dark"), file("c", "Fjord")]);
    expect(r.yours.map((t) => t.name)).toEqual(["Dark 2", "dark 3", "Fjord"]);
  });
  it("uses the file name as the id, not the id inside", () => {
    const f = { id: "a", json: file("b", "X").json };
    const r = loadThemeFiles([f]);
    expect(r.yours[0].id).toBe("a");
  });
  it("skips reserved ids and invalid files, and reads Custom", () => {
    const r = loadThemeFiles([
      file("light", "Mine"),
      file("rm-x", "Mine"),
      { id: "bad", json: "nope" },
      file("custom", "Whatever", '"basedOn":"a",'),
    ]);
    expect(r.yours).toEqual([]);
    expect(r.warnings).toHaveLength(3);
    expect(r.custom?.name).toBe("Custom");
    expect(r.customBasedOn).toBe("a");
  });
});

describe("withCustom", () => {
  const mine = { ...LIGHT, id: "mine", name: "Mine" };
  const custom = (page: string) => ({ ...LIGHT, id: "custom", name: "Custom", colors: { ...LIGHT.colors, page } });

  it("adds Custom last when absent", () => {
    const list = [...BUILT_IN, mine];
    const out = withCustom(list, custom("#111111"));
    expect(out.map((t) => t.id)).toEqual([...BUILT_IN, ...READY_MADE].map((t) => t.id).concat("mine", "custom"));
    expect(list).toHaveLength(BUILT_IN.length + 1);
  });
  it("replaces Custom in place, leaving the other entries untouched", () => {
    const list = [...BUILT_IN, mine, custom("#111111")];
    const next = custom("#222222");
    const out = withCustom(list, next);
    expect(out.map((t) => t.id)).toEqual(list.map((t) => t.id));
    expect(out[out.length - 1]).toBe(next);
    expect(out.slice(0, -1).every((t, i) => t === list[i])).toBe(true);
    expect(list[list.length - 1].colors.page).toBe("#111111");
  });
});

describe("beginEdit pins", () => {
  const mine = (id: string, colors: Partial<Theme["colors"]>): Theme => ({
    id,
    name: id,
    kind: "light",
    colors: { ...LIGHT.colors, hover: undefined, ...colors } as Theme["colors"],
  });
  const strip = (t: Theme): Theme => {
    const c = { ...t.colors };
    for (const k of Object.keys(c) as (keyof typeof c)[]) if (c[k] === undefined) delete c[k];
    return { ...t, colors: c };
  };

  it("seeds Custom's explicit exact colours as pins, so they survive a main-colour change", () => {
    const custom = strip({ ...mine("custom", { quoteBar: "#123456", tabStrip: undefined }), name: "Custom" });
    const s = beginEdit({
      ...custom,
      colors: { page: "#fff", text: "#000", accent: "#00f", sidebar: "#eee", border: "#ddd", quoteBar: "#123456" },
    });
    expect(s.pinned).toEqual({ quoteBar: "#123456" });
    s.mains = { ...s.mains, page: "#fafafa" };
    s.mainsTouched = true;
    expect(editedTheme(s).colors.quoteBar).toBe("#123456");
  });
  it("does the same for your own themes", () => {
    const t: Theme = {
      id: "ocean",
      name: "Ocean",
      kind: "light",
      colors: { page: "#fff", text: "#000", accent: "#00f", sidebar: "#eee", border: "#ddd", hover: "#abcdef" },
    };
    expect(beginEdit(t).pinned).toEqual({ hover: "#abcdef" });
  });
  it("leaves built-in and ready-made starts unpinned", () => {
    expect(beginEdit(LIGHT).pinned).toEqual({});
    expect(beginEdit(READY_MADE[0]).pinned).toEqual({});
  });
});

describe("replaceTarget", () => {
  const themes: Theme[] = [
    ...BUILT_IN,
    ...READY_MADE,
    { id: "ocean", name: "Ocean", kind: "light", colors: LIGHT.colors },
  ];
  it("matches one of your themes ignoring case and spaces", () => {
    expect(replaceTarget(themes, "  ocean ")?.id).toBe("ocean");
  });
  it("never matches built-in, ready-made or Custom names", () => {
    expect(replaceTarget(themes, "Dark")).toBeNull();
    expect(replaceTarget(themes, READY_MADE[0].name)).toBeNull();
    expect(replaceTarget(themes, "Custom")).toBeNull();
    expect(replaceTarget(themes, "Nothing")).toBeNull();
  });
});
