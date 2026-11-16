import { describe, expect, it } from "vitest";
import { PAD, clampView, fitScale, fitView, scaleLimits, wheelFactor, zoomTo } from "$lib/zoomview";

const stage = { w: 1000, h: 800 };

describe("fitScale", () => {
  it("shrinks large content to the padded stage", () => {
    expect(fitScale({ w: 3200, h: 2000 }, stage, false)).toBeCloseTo((1000 - 2 * PAD) / 3200);
  });
  it("never enlarges raster images, but enlarges small diagrams (up to 3×)", () => {
    expect(fitScale({ w: 100, h: 100 }, stage, false)).toBe(1);
    expect(fitScale({ w: 100, h: 50 }, stage, true)).toBe(3);
  });
});

describe("clampView", () => {
  it("centers content smaller than the stage", () => {
    expect(clampView({ scale: 1, x: -500, y: 900 }, { w: 200, h: 100 }, stage)).toEqual({
      scale: 1,
      x: 400,
      y: 350,
    });
  });
  it("keeps large content from being dragged away from the edges", () => {
    const v = clampView({ scale: 1, x: 300, y: -5000 }, { w: 3000, h: 2000 }, stage);
    expect(v.x).toBe(PAD);
    expect(v.y).toBe(800 - 2000 - PAD);
  });
});

describe("zoomTo", () => {
  const content = { w: 3200, h: 2000 };
  it("keeps the point under the cursor in place", () => {
    const start = { scale: 0.5, x: -300, y: -100 };
    const at = { x: 400, y: 300 };
    const v = zoomTo(start, 1, at, content, stage, false);
    // Content point under the cursor before and after.
    expect((at.x - start.x) / start.scale).toBeCloseTo((at.x - v.x) / v.scale);
    expect((at.y - start.y) / start.scale).toBeCloseTo((at.y - v.y) / v.scale);
  });
  it("clamps to the zoom limits", () => {
    const fit = fitView(content, stage, false);
    const { min, max } = scaleLimits(fit.scale);
    expect(zoomTo(fit, 1000, { x: 0, y: 0 }, content, stage, false).scale).toBe(max);
    expect(zoomTo(fit, 0.0001, { x: 0, y: 0 }, content, stage, false).scale).toBe(min);
  });
});

describe("wheelFactor", () => {
  it("zooms in on wheel up and out on wheel down, symmetrically", () => {
    const up = wheelFactor(-100, 0, false);
    expect(up).toBeGreaterThan(1);
    expect(up * wheelFactor(100, 0, false)).toBeCloseTo(1);
  });
  it("treats line-mode deltas like pixel deltas", () => {
    expect(wheelFactor(-3, 1, false)).toBeCloseTo(wheelFactor(-48, 0, false));
  });
});
