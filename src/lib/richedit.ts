/**
 * HTML → markdown conversion for in-place rich editing in reading mode.
 * Scoped to a single top-level block, so the conversion only ever has to
 * handle inline formatting, headings, lists, quotes and tables.
 */
import TurndownService from "turndown";
// @ts-expect-error no type declarations shipped
import { gfm } from "turndown-plugin-gfm";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
  strongDelimiter: "**",
  hr: "---",
});
turndown.use(gfm);

// GFM double-tilde strikethrough (the plugin emits single tildes).
turndown.addRule("inky-strike", {
  filter: ["del", "s"],
  replacement: (content) => `~~${content}~~`,
});

// Tight "- " list markers (turndown pads to four columns) with 2-space nesting.
turndown.addRule("inky-list-item", {
  filter: "li",
  replacement: (content, node, options) => {
    content = content
      .replace(/^\n+/, "")
      .replace(/\n+$/, "\n")
      .replace(/\n/gm, "\n  ");
    let prefix = options.bulletListMarker + " ";
    const parent = node.parentNode as HTMLElement | null;
    if (parent?.nodeName === "OL") {
      const start = parent.getAttribute("start");
      const index = Array.prototype.indexOf.call(parent.children, node);
      prefix = `${start ? Number(start) + index : index + 1}. `;
    }
    return prefix + content + (node.nextSibling && !/\n$/.test(content) ? "\n" : "");
  },
});

// Task-list checkboxes (wins over the gfm plugin's rule, avoiding doubles).
// The preview renders them shadcn-style as <span class="task-box"><input…><svg…></span>;
// matching the wrapper also swallows the check icon. Bare inputs in an <li>
// (e.g. pasted HTML) keep working via the second condition.
const isChecked = (input: Element | null) =>
  !!input && ((input as HTMLInputElement).checked || input.hasAttribute("checked"));
turndown.addRule("inky-task", {
  filter: (node) =>
    (node.nodeName === "SPAN" && node.classList.contains("task-box")) ||
    (node.nodeName === "INPUT" &&
      node.getAttribute("type") === "checkbox" &&
      node.parentNode?.nodeName === "LI"),
  replacement: (_content, node) => {
    const input =
      node.nodeName === "INPUT" ? (node as Element) : (node as Element).querySelector("input");
    return isChecked(input) ? "[x] " : "[ ] ";
  },
});

// Local images are rewritten to asset: URLs for display; write the original
// markdown path back out (stored in data-md-src by the preview).
turndown.addRule("inky-images", {
  filter: "img",
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const src = el.getAttribute("data-md-src") ?? el.getAttribute("src") ?? "";
    const alt = el.getAttribute("alt") ?? "";
    return `![${alt}](${src})`;
  },
});

// Embedded videos (see $lib/markdown) go back to the image syntax they came from.
turndown.addRule("inky-videos", {
  filter: (node) => node.nodeName === "SPAN" && node.classList.contains("video-embed"),
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const video = el.querySelector("video");
    const src = video?.getAttribute("data-md-src") ?? video?.getAttribute("src") ?? "";
    const alt = el.querySelector(".video-caption")?.textContent ?? "";
    return `![${alt}](${src})`;
  },
});

export function htmlToMarkdown(html: string): string {
  return (
    turndown
      .turndown(html)
      // The rendered checkbox is followed by a text space; collapse doubles.
      .replace(/^(\s*(?:[-*+]|\d+\.) \[[ xX]\]) +/gm, "$1 ")
  );
}

/**
 * Apply an in-place edit to a block's markdown source without rewriting
 * the rest of it. `before` and `after` are the block's HTML converted to
 * markdown before and after the edit; that conversion is not faithful
 * (it adds escapes, normalizes markers), so only the span that actually
 * changed between them is spliced into `source`, located by its
 * surrounding text. Returns null when that span can't be placed safely.
 */
export function spliceEdit(source: string, before: string, after: string): string | null {
  if (before === after) return source;
  if (source === before) return after;
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let s = 0;
  while (
    s < before.length - p &&
    s < after.length - p &&
    before[before.length - 1 - s] === after[after.length - 1 - s]
  ) {
    s++;
  }
  const oldMid = before.slice(p, before.length - s);
  const newMid = after.slice(p, after.length - s);
  // Score each place the old span could sit in the source by how much of the
  // surrounding text matches there (the conversion's escapes stop a match
  // early, so this is a count, not an exact comparison).
  const leftMatch = (i: number) => {
    let k = 0;
    while (k < p && k < i && before[p - 1 - k] === source[i - 1 - k]) k++;
    return k;
  };
  const rightMatch = (j: number) => {
    let k = 0;
    const r = before.length - s;
    while (k < s && j + k < source.length && before[r + k] === source[j + k]) k++;
    return k;
  };
  let best = -1;
  let bestScore = -1;
  let tie = false;
  const consider = (i: number) => {
    const score = leftMatch(i) + rightMatch(i + oldMid.length);
    if (score > bestScore) {
      bestScore = score;
      best = i;
      tie = false;
    } else if (score === bestScore) {
      tie = true;
    }
  };
  if (oldMid) {
    for (let i = source.indexOf(oldMid); i !== -1; i = source.indexOf(oldMid, i + 1)) consider(i);
  } else {
    for (let i = 0; i <= source.length; i++) consider(i);
  }
  // Demand enough matching context to be sure, and a single best place.
  if (best < 0 || tie || bestScore < Math.min(8, p + s)) return null;
  return source.slice(0, best) + newMid + source.slice(best + oldMid.length);
}
