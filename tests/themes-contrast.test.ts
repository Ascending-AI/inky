import { describe, expect, it } from "vitest";
import { LIGHT } from "../src/lib/themes/builtin";
import { contrastIssues, contrastRatio } from "../src/lib/themes/contrast";
import type { Theme } from "../src/lib/themes/model";

const identity = (css: string) => css;

/** Light, with hex main colours so the identity resolver can read them. */
const HEX_LIGHT: Theme = {
  id: "hex-light",
  name: "Hex light",
  kind: "light",
  colors: { page: "#ffffff", text: "#1f2328", accent: "#2f6fd6", sidebar: "#fafafa", border: "#e6e8eb" },
};

describe("contrastRatio", () => {
  it("is 21 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
  });
  it("matches WCAG for mid grey on white", () => {
    expect(Math.abs(contrastRatio("#777777", "#ffffff") - 4.48)).toBeLessThanOrEqual(0.01);
  });
  it("reads short hex", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 2);
  });
  it("composites a translucent colour over the background", () => {
    expect(Math.abs(contrastRatio("#00000080", "#ffffff") - 4.0)).toBeLessThanOrEqual(0.05);
  });
  it("is symmetric", () => {
    expect(contrastRatio("#ffffff", "#777777")).toBeCloseTo(contrastRatio("#777777", "#ffffff"), 6);
  });
});

describe("contrastIssues", () => {
  it("flags a pale accent on a white page", () => {
    const t: Theme = { ...HEX_LIGHT, colors: { ...HEX_LIGHT.colors, accent: "#7fb2ff" } };
    const issues = contrastIssues(t, identity);
    expect(issues.map((i) => i.key)).toEqual(["accent"]);
    expect(issues[0].ratio).toBeLessThan(4.5);
  });
  it("does not flag readable text", () => {
    expect(contrastIssues(HEX_LIGHT, identity)).toEqual([]);
  });
  it("flags low-contrast sidebar text, using the theme's sidebarText when set", () => {
    const t: Theme = { ...HEX_LIGHT, ui: { sidebarText: "#bbbbbb" } };
    expect(contrastIssues(t, identity).map((i) => i.key)).toEqual(["sidebar"]);
  });
  it("flags body text and checks sidebar text against the sidebar", () => {
    const t: Theme = { ...HEX_LIGHT, colors: { ...HEX_LIGHT.colors, text: "#cccccc" } };
    expect(contrastIssues(t, identity).map((i) => i.key)).toEqual(["text", "sidebar"]);
  });
  it("skips pairs whose colours cannot be resolved instead of warning", () => {
    expect(contrastIssues(LIGHT, () => null)).toEqual([]);
    // Built-in values are oklch / var(): the identity resolver cannot read them.
    expect(contrastIssues(LIGHT, identity)).toEqual([]);
  });
});
