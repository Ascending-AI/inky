import { describe, expect, it } from "vitest";
import { BUILT_IN } from "../src/lib/themes/builtin";
import { pushRecent, RECENT_MAX, shortThemeSections } from "../src/lib/themes/library";
import { READY_MADE } from "../src/lib/themes/readymade";

const [a, b, c, d, e] = READY_MADE.map((t) => t.id);
const ALL = [...BUILT_IN, ...READY_MADE];

describe("pushRecent", () => {
  it("puts a ready-made theme first without duplicates", () => {
    expect(pushRecent([a, b], b)).toEqual([b, a]);
  });
  it("keeps at most RECENT_MAX", () => {
    expect(pushRecent([a, b, c, d], e)).toEqual([e, a, b, c]);
    expect(RECENT_MAX).toBe(4);
  });
  it("ignores built-in, your themes and Custom", () => {
    expect(pushRecent([a], "dark")).toEqual([a]);
    expect(pushRecent([a], "custom")).toEqual([a]);
    expect(pushRecent([a], "my-theme")).toEqual([a]);
  });
});

describe("shortThemeSections", () => {
  it("leaves out ready-made themes never used", () => {
    const s = shortThemeSections(ALL, [], "light");
    expect(s.map((x) => x.label)).toEqual(["Built-in"]);
  });
  it("lists recent ready-made themes in order", () => {
    const s = shortThemeSections(ALL, [b, a], "light");
    expect(s.at(-1)).toEqual({ label: "Recent", items: [READY_MADE[1], READY_MADE[0]] });
  });
  it("always includes the active ready-made theme, first", () => {
    const s = shortThemeSections(ALL, [a], c);
    expect(s.at(-1)!.items.map((t) => t.id)).toEqual([c, a]);
  });
  it("drops recent ids that no longer exist", () => {
    const s = shortThemeSections(ALL, ["rm-gone", a], "light");
    expect(s.at(-1)!.items.map((t) => t.id)).toEqual([a]);
  });
});
