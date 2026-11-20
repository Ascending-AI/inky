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

  it("defaults to the system typeface and leaves spacing to the stylesheet", () => {
    const vars = typographyVars(DEFAULT_TYPOGRAPHY);
    expect(vars["--prose-leading"]).toBeNull();
    expect(vars["--prose-para-gap"]).toBeNull();
    expect(isDefaultTypography(loadTypography())).toBe(true);
  });

  it("book users keep the serif typeface", () => {
    localStorage.setItem("inky.typography", JSON.stringify({ typeface: "theme" }));
    expect(loadTypography("book").typeface).toBe("iowan");
  });

  it("the old Theme typeface becomes Default", () => {
    localStorage.setItem("inky.typography", JSON.stringify({ typeface: "theme" }));
    expect(loadTypography("light").typeface).toBe("default");
    expect(loadTypography().typeface).toBe("default");
  });

  it("a book user with no stored typography keeps the serif typeface", () => {
    expect(loadTypography("book").typeface).toBe("iowan");
    expect(loadTypography("light").typeface).toBe("default");
    expect(loadTypography().typeface).toBe("default");
  });

  it("Default typeface uses the system font", () => {
    const vars = typographyVars({ ...DEFAULT_TYPOGRAPHY, typeface: "default" });
    expect(vars["--prose-font"]).toContain("-apple-system");
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
