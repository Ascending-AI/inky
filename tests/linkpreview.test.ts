import { describe, expect, it } from "vitest";
import { linkTarget, openingHtml } from "$lib/linkpreview";

function page(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  document.body.replaceChildren(el);
  return el;
}

const DOC = `
<h1 id="title">Title</h1><p>Intro <sup><a href="#footnote-1" data-footnote-ref>1</a></sup>
<a id="s" href="#second">second</a> <a id="d" href="Other%20doc.md#part">doc</a>
<a id="x" href="https://example.com">web</a> <a id="f" href="data.csv">file</a></p>
<h2 id="second">Second</h2><p>Body of second.</p><h3 id="sub">Sub</h3><p>Sub body.</p>
<h2 id="third">Third</h2><p>Not part of second.</p>
<section class="footnotes"><ol><li id="footnote-1"><p>Note <strong>one</strong>.
<a href="#footnote-ref-1" data-footnote-backref>↩</a></p></li></ol></section>`;

describe("linkTarget", () => {
  it("previews a footnote without its back-reference or ids", () => {
    const p = page(DOC);
    const t = linkTarget(p.querySelector("a[data-footnote-ref]")!, p);
    expect(t?.kind).toBe("footnote");
    if (t?.kind !== "footnote") return;
    expect(t.label).toBe("Footnote 1");
    expect(t.html).toContain("<strong>one</strong>");
    expect(t.html).not.toContain("↩");
    expect(t.html).not.toContain("id=");
  });

  it("previews a heading's section up to the next heading of its level", () => {
    const p = page(DOC);
    const t = linkTarget(p.querySelector<HTMLAnchorElement>("#s")!, p);
    expect(t?.kind).toBe("section");
    if (t?.kind !== "section") return;
    expect(t.html).toContain("Body of second.");
    expect(t.html).toContain("Sub body.");
    expect(t.html).not.toContain("Not part of second.");
  });

  it("classifies document, external and other links", () => {
    const p = page(DOC);
    expect(linkTarget(p.querySelector<HTMLAnchorElement>("#d")!, p)).toEqual({
      kind: "doc",
      href: "Other%20doc.md#part",
      fragment: "part",
    });
    expect(linkTarget(p.querySelector<HTMLAnchorElement>("#x")!, p)).toEqual({
      kind: "external",
      url: "https://example.com",
    });
    expect(linkTarget(p.querySelector<HTMLAnchorElement>("#f")!, p)).toBeNull();
    expect(linkTarget(p.querySelector<HTMLAnchorElement>("[data-footnote-backref]")!, p)).toBeNull();
  });
});

describe("openingHtml", () => {
  it("starts at the fragment when it exists, else at the top", () => {
    expect(openingHtml(DOC, "third")).toContain("Not part of second.");
    expect(openingHtml(DOC, "missing")).toContain("Title");
  });
});
