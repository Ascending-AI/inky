import { describe, expect, it } from "vitest";
import { BUILT_IN, DARK, LIGHT } from "$lib/themes/builtin";
import { applyThemeTo } from "$lib/themes/apply";
import { THEME_PROPS } from "$lib/themes/model";

describe("applyThemeTo", () => {
  it("sets every theme property", () => {
    for (const t of BUILT_IN) {
      const el = document.createElement("div");
      applyThemeTo(el, t);
      for (const prop of THEME_PROPS) {
        expect(el.style.getPropertyValue(prop), `${t.id} ${prop}`).not.toBe("");
      }
    }
  });

  it("sets the kind class", () => {
    const el = document.createElement("div");
    el.classList.add("book");
    applyThemeTo(el, DARK);
    expect(el.classList.contains("dark")).toBe(true);
    expect(el.classList.contains("light")).toBe(false);
    applyThemeTo(el, LIGHT);
    expect(el.classList.contains("light")).toBe(true);
    expect(el.classList.contains("dark")).toBe(false);
    expect(el.classList.contains("book")).toBe(false);
  });

  it("color-scheme follows the kind", () => {
    const el = document.createElement("div");
    applyThemeTo(el, DARK);
    expect(el.style.colorScheme).toBe("dark");
    applyThemeTo(el, LIGHT);
    expect(el.style.colorScheme).toBe("light");
  });
});
