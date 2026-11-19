import { describe, expect, it } from "vitest";
import { applyStamps } from "$lib/imagestamps";

describe("applyStamps", () => {
  it("takes the first stamp of an image as its baseline, without a new version", () => {
    const seen = new Map<string, string>();
    const versions: Record<string, string> = {};
    expect(applyStamps(seen, versions, { "/lib/a.png": "100-5" })).toEqual([]);
    expect(seen.get("/lib/a.png")).toBe("100-5");
    expect(versions).toEqual({});
  });

  it("gives an image a new version when its file changed on disk", () => {
    const seen = new Map([["/lib/a.png", "100-5"], ["/lib/b.png", "100-9"]]);
    const versions: Record<string, string> = {};
    const changed = applyStamps(seen, versions, { "/lib/a.png": "200-7", "/lib/b.png": "100-9" });
    expect(changed).toEqual(["/lib/a.png"]);
    expect(versions).toEqual({ "/lib/a.png": "200-7" });
    expect(seen.get("/lib/a.png")).toBe("200-7");
  });

  it("leaves images the stamps don't mention (missing files) alone", () => {
    const seen = new Map([["/lib/a.png", "100-5"]]);
    const versions: Record<string, string> = { "/lib/a.png": "100-5" };
    expect(applyStamps(seen, versions, {})).toEqual([]);
    expect(versions).toEqual({ "/lib/a.png": "100-5" });
  });
});
