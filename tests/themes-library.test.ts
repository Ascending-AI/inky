import { describe, expect, it } from "vitest";
import { BUILT_IN, DARK, LIGHT } from "../src/lib/themes/builtin";
import {
  activeOrFallback,
  beginEdit,
  customFile,
  editedTheme,
  slugFor,
  uniqueName,
} from "../src/lib/themes/library";
import { parseTheme } from "../src/lib/themes/model";

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
