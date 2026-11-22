import { describe, expect, it, vi } from "vitest";

vi.mock("mermaid", () => ({
  default: { initialize: vi.fn(), render: vi.fn() },
}));

import { extractBlocks, extractToc, renderMarkdown } from "$lib/markdown";
import { htmlToMarkdown } from "$lib/richedit";

const SAMPLE = `# Title

Intro text.

## Section one

\`\`\`md
# not a heading (fenced)
\`\`\`

## Section one

### **Bold** heading [link](https://x.dev)
`;

describe("task checkboxes", () => {
  it("renders enabled, classed checkboxes", () => {
    const html = renderMarkdown("- [ ] open\n- [x] done\n");
    const boxes = [...html.matchAll(/<input[^>]*>/g)].map((m) => m[0]);
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toContain('class="task-checkbox"');
    expect(boxes[0]).not.toContain("disabled");
    expect(boxes[0]).not.toContain("checked");
    expect(boxes[1]).toContain("checked");
    // The shadcn-style check icon must survive sanitization.
    expect(html.match(/class="task-check"/g)).toHaveLength(2);
    expect(html).toContain('class="task-box"');
  });
});

describe("extractToc", () => {
  it("extracts levels and lines, skipping fenced code", () => {
    const toc = extractToc(SAMPLE);
    expect(toc.map((t) => [t.level, t.text])).toEqual([
      [1, "Title"],
      [2, "Section one"],
      [2, "Section one"],
      [3, "Bold heading link"],
    ]);
    expect(toc[1].line).toBe(5);
  });

  it("deduplicates repeated heading ids", () => {
    const toc = extractToc(SAMPLE);
    expect(toc[1].id).toBe("section-one");
    expect(toc[2].id).toBe("section-one-1");
  });

  it("generates the same ids the renderer puts in the HTML", () => {
    const toc = extractToc(SAMPLE);
    const html = renderMarkdown(SAMPLE);
    for (const entry of toc) {
      expect(html).toContain(`id="${entry.id}"`);
    }
  });
});

describe("extractBlocks", () => {
  it("splits top-level blocks on blank lines, fence-aware", () => {
    const src = "# Head\n\nPara one\nstill para one\n\n```js\n\nconst x = 1;\n\n```\n\nPara two\n";
    const blocks = extractBlocks(src).map((b) => src.slice(b.start, b.end));
    expect(blocks).toEqual([
      "# Head",
      "Para one\nstill para one",
      "```js\n\nconst x = 1;\n\n```",
      "Para two",
    ]);
  });

  it("merges loose list items into one block", () => {
    const src = "intro\n\n- one\n\n- two\n  continued\n\noutro\n";
    const blocks = extractBlocks(src).map((b) => src.slice(b.start, b.end));
    expect(blocks).toEqual(["intro", "- one\n\n- two\n  continued", "outro"]);
  });

  it("round-trips edits by char range", () => {
    const src = "# A\n\nfirst\n\nsecond\n";
    const blocks = extractBlocks(src);
    const b = blocks[1];
    const edited = src.slice(0, b.start) + "FIRST!" + src.slice(b.end);
    expect(edited).toBe("# A\n\nFIRST!\n\nsecond\n");
  });
});

describe("rich edit round-trip", () => {
  const roundTrip = (md: string) => htmlToMarkdown(renderMarkdown(md)).trim();

  it("round-trips inline formatting", () => {
    expect(roundTrip("Some **bold**, *italic*, `code` and ~~struck~~ text.")).toBe(
      "Some **bold**, *italic*, `code` and ~~struck~~ text.",
    );
  });

  it("round-trips headings, lists and quotes", () => {
    expect(roundTrip("## A heading")).toBe("## A heading");
    expect(roundTrip("- one\n- two")).toBe("- one\n- two");
    expect(roundTrip("> quoted text")).toBe("> quoted text");
  });

  it("round-trips links and task lists", () => {
    expect(roundTrip("[site](https://x.dev)")).toBe("[site](https://x.dev)");
    expect(roundTrip("- [x] done\n- [ ] todo")).toContain("[x] done");
  });

  it("writes local image paths back from data-md-src", () => {
    expect(
      htmlToMarkdown('<p><img src="asset://x" data-md-src="assets/a.png" alt="pic"></p>'),
    ).toBe("![pic](assets/a.png)");
  });

  it("writes embedded videos back as image syntax", () => {
    const html =
      '<p><span class="video-embed"><video src="asset://x" data-md-src="images/e.mp4" controls></video>' +
      '<button class="video-open">Open in tab</button><span class="video-caption">What we found</span></span></p>';
    expect(htmlToMarkdown(html)).toBe("![What we found](images/e.mp4)");
  });
});

describe("renderMarkdown", () => {
  it("renders videos written as images as players with a caption", () => {
    const box = document.createElement("div");
    box.innerHTML = renderMarkdown('Intro ![What "we" found <b>](images/explainer.MP4)');
    const video = box.querySelector("p span.video-embed video");
    expect(video?.getAttribute("src")).toBe("images/explainer.MP4");
    expect(video?.hasAttribute("controls")).toBe(true);
    expect(video?.getAttribute("preload")).toBe("metadata");
    expect(box.querySelector(".video-caption")?.textContent).toBe('What "we" found <b>');
    expect(box.querySelector("img, b")).toBeNull();
  });

  it("gives a video without alt text no caption, and keeps images as images", () => {
    const box = document.createElement("div");
    box.innerHTML = renderMarkdown("![](clip.webm) ![pic](shot.png)");
    expect(box.querySelector("video")?.getAttribute("src")).toBe("clip.webm");
    expect(box.querySelector(".video-caption")).toBeNull();
    expect(box.querySelector("img")?.getAttribute("src")).toBe("shot.png");
  });

  it("blocks remote videos like remote images", () => {
    const box = document.createElement("div");
    box.innerHTML = renderMarkdown("![talk](https://example.com/t.mp4)");
    const video = box.querySelector("video")!;
    expect(video.hasAttribute("src")).toBe(false);
    expect(video.getAttribute("data-remote-src")).toBe("https://example.com/t.mp4");
  });

  it("renders mermaid fences as placeholders, not code blocks", () => {
    const html = renderMarkdown("```mermaid\nflowchart LR\nA-->B\n```\n");
    expect(html).toContain("data-mermaid=");
    expect(html).not.toContain("<code");
  });

  it("sanitizes script injection", () => {
    const html = renderMarkdown('hello <script>alert(1)</script> <img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });
});

describe("inline math", () => {
  it("leaves dollar amounts as text", () => {
    const html = renderMarkdown("It costs $30 to $40, or $5 and $6.");
    expect(html).not.toContain("katex");
    expect(html).toContain("$30 to $40, or $5 and $6.");
  });

  it("renders $...$ math, including next to punctuation", () => {
    expect(renderMarkdown("where $x^2$ is")).toContain("katex");
    expect(renderMarkdown("(see $a+b$)")).toContain("katex");
    expect(renderMarkdown("display $$E=mc^2$$ inline")).toContain("katex-display");
  });

  it("needs non-space just inside the delimiters", () => {
    expect(renderMarkdown("a $ b $ c")).not.toContain("katex");
  });

  it("still renders block math", () => {
    expect(renderMarkdown("$$\nx = 1\n$$\n")).toContain("katex-display");
  });
});

describe("remote content", () => {
  const md = [
    "![chart](https://example.com/c.png) ![local](images/a.png) [a link](https://example.com)",
    "",
    '<img src="//cdn.example.com/x.gif"><p style="background:url(https://t.example/p.png)">styled</p>',
    "",
    '<video poster="https://example.com/p.jpg"></video><svg><image href="https://example.com/s.png"></image></svg>',
    "",
    "<style>body { display: none }</style>",
  ].join("\n");

  const render = (opts?: { remoteImages?: boolean }) => {
    const box = document.createElement("div");
    box.innerHTML = renderMarkdown(md, opts);
    return box;
  };

  it("blocks remote images and media by default, keeping links and local images", () => {
    const box = render();
    const fetching = [...box.querySelectorAll("*")].flatMap((el) =>
      [...el.attributes]
        .filter((a) => !a.name.startsWith("data-") && !(el.tagName === "A" && a.name === "href"))
        .filter((a) => a.value.includes("//"))
        .map((a) => `${el.tagName}.${a.name}`),
    );
    expect(fetching).toEqual([]);
    expect(box.querySelectorAll("[data-remote-blocked]")).toHaveLength(5);
    expect(box.querySelector('img[alt="local"]')?.getAttribute("src")).toBe("images/a.png");
    expect(box.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
    const chart = box.querySelector('img[alt="chart"]')!;
    expect(chart.hasAttribute("src")).toBe(false);
    expect(chart.getAttribute("data-remote-src")).toBe("https://example.com/c.png");
  });

  it("loads them when allowed", () => {
    const box = render({ remoteImages: true });
    expect(box.querySelectorAll("[data-remote-blocked]")).toHaveLength(0);
    expect(box.querySelector('img[alt="chart"]')?.getAttribute("src")).toBe("https://example.com/c.png");
  });

  it("never renders <style> (it would restyle the whole app)", () => {
    expect(render({ remoteImages: true }).querySelector("style")).toBeNull();
  });

  it("writes a blocked image back unchanged when its paragraph is edited", () => {
    const p = render().querySelector("p")!;
    expect(htmlToMarkdown(p.outerHTML)).toContain("![chart](https://example.com/c.png)");
  });
});
