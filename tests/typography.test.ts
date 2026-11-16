import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TYPOGRAPHY,
  isDefaultTypography,
  loadTypography,
  saveTypography,
  typographyVars,
} from "$lib/typography";

describe("typography", () => {
  beforeEach(() => localStorage.clear());

  it("defaults leave every property to the theme", () => {
    expect(Object.values(typographyVars(DEFAULT_TYPOGRAPHY)).every((v) => v === null)).toBe(true);
    expect(isDefaultTypography(loadTypography())).toBe(true);
  });

  it("maps choices to CSS properties", () => {
    const vars = typographyVars({ typeface: "charter", lineSpacing: "relaxed", paraSpacing: "airy", justify: true });
    expect(vars["--prose-font"]).toContain("Charter");
    expect(vars["--prose-heading-font"]).toContain("Avenir Next");
    expect(vars["--prose-leading"]).toBe("2");
    expect(vars["--prose-para-gap"]).toBe("1.4em");
  });

  it("round-trips through storage and drops unknown values", () => {
    saveTypography({ typeface: "iowan", lineSpacing: "tight", paraSpacing: "compact", justify: true });
    expect(loadTypography()).toEqual({ typeface: "iowan", lineSpacing: "tight", paraSpacing: "compact", justify: true });
    localStorage.setItem("inky.typography", JSON.stringify({ typeface: "comic", justify: "yes" }));
    expect(loadTypography()).toEqual(DEFAULT_TYPOGRAPHY);
    localStorage.setItem("inky.typography", "not json");
    expect(loadTypography()).toEqual(DEFAULT_TYPOGRAPHY);
  });
});
