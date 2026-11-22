import { describe, expect, it } from "vitest";
import { isPlayKey, seekStep } from "../src/lib/videokeys";

const key = (key: string, mods: Partial<KeyboardEventInit> = {}) => new KeyboardEvent("keydown", { key, ...mods });

describe("seekStep", () => {
  it("moves 5 seconds back or ahead on the plain arrow keys", () => {
    expect(seekStep(key("ArrowLeft"))).toBe(-5);
    expect(seekStep(key("ArrowRight"))).toBe(5);
  });

  it("leaves modified arrows and other keys to their own shortcuts", () => {
    expect(seekStep(key("ArrowLeft", { metaKey: true }))).toBeNull();
    expect(seekStep(key("ArrowRight", { altKey: true }))).toBeNull();
    expect(seekStep(key("ArrowRight", { shiftKey: true }))).toBeNull();
    expect(seekStep(key("ArrowUp"))).toBeNull();
    expect(seekStep(key(" "))).toBeNull();
  });

  it("does nothing while typing", () => {
    const input = document.createElement("input");
    document.body.append(input);
    const e = key("ArrowLeft");
    Object.defineProperty(e, "target", { value: input });
    expect(seekStep(e)).toBeNull();
    input.remove();
  });
});

describe("isPlayKey", () => {
  it("is a plain Space, and never while typing", () => {
    expect(isPlayKey(key(" "))).toBe(true);
    expect(isPlayKey(key(" ", { shiftKey: true }))).toBe(false);
    expect(isPlayKey(key(" ", { metaKey: true }))).toBe(false);
    expect(isPlayKey(key("k"))).toBe(false);
    const area = document.createElement("textarea");
    document.body.append(area);
    const e = key(" ");
    Object.defineProperty(e, "target", { value: area });
    expect(isPlayKey(e)).toBe(false);
    area.remove();
  });
});
