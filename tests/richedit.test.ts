import { describe, expect, it } from "vitest";
import { htmlToMarkdown, spliceEdit } from "$lib/richedit";

describe("spliceEdit", () => {
  it("changes only the edited words, keeping the source's own syntax", () => {
    const source = "## 1. The short answer";
    const before = htmlToMarkdown("<h2>1. The short answer</h2>"); // "## 1\\. The short answer"
    expect(before).not.toBe(source);
    const after = htmlToMarkdown("<h2>1. The long answer</h2>");
    expect(spliceEdit(source, before, after)).toBe("## 1. The long answer");
  });

  it("keeps escapes and markup elsewhere in the paragraph untouched", () => {
    const source = "Tagged [Vendor] in _sources_. We flag each conflict.";
    const before = htmlToMarkdown("<p>Tagged [Vendor] in <em>sources</em>. We flag each conflict.</p>");
    const after = htmlToMarkdown("<p>Tagged [Vendor] in <em>sources</em>. We flag every conflict.</p>");
    expect(spliceEdit(source, before, after)).toBe("Tagged [Vendor] in _sources_. We flag every conflict.");
  });

  it("is a no-op when nothing changed, and exact when the conversion is faithful", () => {
    expect(spliceEdit("## 1. A", "## 1\\. A", "## 1\\. A")).toBe("## 1. A");
    expect(spliceEdit("Plain text", "Plain text", "Plain text here")).toBe("Plain text here");
  });

  it("gives up when the change can't be placed unambiguously", () => {
    expect(spliceEdit("a b a b", "a b a b x", "a b a b y")).toBeNull();
    expect(spliceEdit("totally different", "other words", "other wordz")).toBeNull();
  });
});
