import { describe, expect, it } from "vitest";
import { contrastRatio } from "../src/lib/themes/contrast";
import { parseTheme, serializeTheme } from "../src/lib/themes/model";
import { BUILT_IN } from "../src/lib/themes/builtin";
import { READY_MADE } from "../src/lib/themes/readymade";

const HEX6 = /^#[0-9a-f]{6}$/i;

describe("READY_MADE", () => {
  it("has about two dozen themes", () => {
    expect(READY_MADE.length).toBeGreaterThanOrEqual(20);
  });

  it("every ready-made theme parses after serializing", () => {
    for (const t of READY_MADE) {
      const r = parseTheme(serializeTheme(t), () => true);
      expect(r.ok, t.name).toBe(true);
      if (r.ok) {
        expect(r.theme).toEqual(t);
        expect(r.warnings).toEqual([]);
      }
    }
  });

  it("main colours are #rrggbb", () => {
    for (const t of READY_MADE) {
      for (const k of ["page", "text", "accent", "sidebar", "border"] as const) {
        expect(t.colors[k], `${t.name} ${k}`).toMatch(HEX6);
      }
    }
  });

  it("ids are unique and prefixed rm-", () => {
    const ids = READY_MADE.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^rm-[a-z0-9-]+$/);
  });

  it("names are unique and differ from the built-ins", () => {
    const names = [...BUILT_IN, ...READY_MADE].map((t) => t.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("roughly half are dark", () => {
    const dark = READY_MADE.filter((t) => t.kind === "dark").length;
    expect(dark / READY_MADE.length).toBeGreaterThanOrEqual(0.4);
    expect(dark / READY_MADE.length).toBeLessThanOrEqual(0.6);
  });

  it("every ready-made theme passes contrast", () => {
    for (const t of READY_MADE) {
      const c = t.colors;
      const sidebarText = t.ui?.sidebarText ?? c.text;
      expect(contrastRatio(c.text, c.page), `${t.name} text/page`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.accent, c.page), `${t.name} accent/page`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(sidebarText, c.sidebar), `${t.name} sidebar`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
