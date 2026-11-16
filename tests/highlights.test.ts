import { describe, expect, it } from "vitest";
import {
  forgetInStore,
  highlightsToMarkdown,
  parseStore,
  remapStore,
  type Highlight,
  type HighlightStore,
} from "$lib/highlights";

const hl = (id: string, over: Partial<Highlight> = {}): Highlight => ({
  id,
  quote: `quote ${id}`,
  prefix: "",
  suffix: "",
  color: "yellow",
  note: "",
  createdAt: "2026-11-16T12:00:00.000Z",
  ...over,
});

describe("parseStore", () => {
  it("keeps valid highlights and fills missing optional fields", () => {
    const raw = JSON.stringify({ "/lib/a.md": [{ id: "1", quote: "q", color: "pink" }] });
    expect(parseStore(raw)["/lib/a.md"][0]).toMatchObject({ id: "1", quote: "q", color: "pink", note: "", prefix: "" });
  });

  it("drops malformed entries instead of failing", () => {
    const raw = JSON.stringify({
      "/lib/a.md": [{ id: "1", quote: "", color: "pink" }, { id: "2", quote: "ok", color: "rainbow" }, null],
      "/lib/b.md": "nope",
    });
    expect(parseStore(raw)).toEqual({});
    expect(parseStore("not json")).toEqual({});
    expect(parseStore("")).toEqual({});
    expect(parseStore("[1,2]")).toEqual({});
  });
});

describe("store paths", () => {
  it("follows renamed files and folders, and forgets deleted ones", () => {
    const store: HighlightStore = { "/lib/dir/a.md": [hl("1")], "/lib/dirx/b.md": [hl("2")] };
    expect(remapStore(store, "/lib/dir", "/lib/moved")).toBe(true);
    expect(Object.keys(store).sort()).toEqual(["/lib/dirx/b.md", "/lib/moved/a.md"]);
    expect(forgetInStore(store, "/lib/moved")).toBe(true);
    expect(forgetInStore(store, "/lib/nothing")).toBe(false);
    expect(Object.keys(store)).toEqual(["/lib/dirx/b.md"]);
  });
});

describe("highlightsToMarkdown", () => {
  it("groups quotes by document with colour and note", () => {
    const md = highlightsToMarkdown([
      { title: "Plan", highlights: [hl("1", { quote: "Ship  in\nweek 27", color: "green", note: "Check with team" })] },
      { title: "Empty", highlights: [] },
    ]);
    expect(md).toBe("## Plan\n\n> Ship in week 27\n>\n> — green highlight\n\nCheck with team\n");
  });
});

describe("readable text", () => {
  it("drops footnote markers from the displayed and exported quote", async () => {
    const { readableText, shownText } = await import("$lib/highlights");
    const p = document.createElement("p");
    p.innerHTML = 'and grading.<sup><a href="#fn-3" data-footnote-ref>3</a></sup> Two readings';
    document.body.replaceChildren(p);
    const range = document.createRange();
    range.selectNodeContents(p);
    expect(range.toString()).toBe("and grading.3 Two readings");
    expect(readableText(range)).toBe("and grading. Two readings");
    expect(shownText(hl("x", { quote: "a.3 b", text: "a. b" }))).toBe("a. b");
    expect(shownText(hl("y", { quote: "plain  text" }))).toBe("plain text");
  });
});

describe("text offsets", () => {
  it("maps DOM boundaries to page-text offsets and back, across marks", async () => {
    const { flatText, textOffset, rangeFromOffsets } = await import("$lib/comments");
    const box = document.createElement("div");
    box.innerHTML = '<p>Alpha <mark class="hl">beta gamma</mark> delta</p><p>Epsilon</p>';
    document.body.replaceChildren(box);
    const full = flatText(box);
    expect(full).toBe("Alpha beta gamma deltaEpsilon");
    const mark = box.querySelector("mark")!;
    expect(textOffset(box, mark.firstChild!, 5)).toBe(full.indexOf("gamma"));
    expect(textOffset(box, box.querySelectorAll("p")[1], 0)).toBe(full.indexOf("Epsilon"));
    const r = rangeFromOffsets(box, full.indexOf("gamma"), full.indexOf("Epsilon") + 3)!;
    expect(r.toString()).toBe("gamma deltaEps");
  });
});
