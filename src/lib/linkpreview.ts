/**
 * What a link points at, for hover previews in the reading pane: footnotes
 * and same-document headings are cut from the rendered page; other
 * documents are rendered from their source; external links only show the
 * address (nothing is fetched from the web).
 */

export type LinkTarget =
  /** `open`: what the footnote cites (its first link, or a file path in code). */
  | { kind: "footnote"; label: string; html: string; open: string | null }
  | { kind: "section"; label: string; html: string }
  | { kind: "doc"; href: string; fragment: string | null }
  | { kind: "external"; url: string };

/** Enough to read the gist without turning the card into a second page. */
const MAX_BLOCKS = 4;
const MAX_CHARS = 700;

function isHeading(el: Element): boolean {
  return /^H[1-6]$/.test(el.tagName);
}

/** Inline code that is a file path (`/Users/…/notes.md`, `../a.md`). */
const PATH_RE = /^(\/|\.\.?\/)[^\n]*[^\s/]$/;

/**
 * Make what a footnote cites openable: file paths written as inline code
 * get `data-open-href`; returns the first link or path (the card's target).
 */
function markCitations(root: Element): string | null {
  let first: string | null = null;
  for (const el of root.querySelectorAll("a[href], code")) {
    let href: string | null = null;
    if (el.tagName === "A") {
      if (!el.hasAttribute("data-footnote-backref")) href = el.getAttribute("href");
    } else if (!el.closest("a, pre")) {
      const text = el.textContent?.trim() ?? "";
      if (PATH_RE.test(text)) {
        href = text;
        el.setAttribute("data-open-href", text);
        el.classList.add("open-path");
      }
    }
    if (href && !first) first = href;
  }
  return first;
}

/** Short name for "Click to open …": a host for web links, a file name for paths. */
export function targetName(href: string): string {
  try {
    if (/^https?:/i.test(href)) return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    // Not a URL after all; fall through.
  }
  const name = href.split("#")[0].split("/").pop() || href;
  try {
    return decodeURIComponent(name);
  } catch {
    return name; // A literal "%" in a file name.
  }
}

function stripForPreview(root: Element) {
  root.querySelectorAll("[data-footnote-backref], .mermaid-block").forEach((n) => n.remove());
  // Ids would duplicate the page's own (anchors, TOC, footnote targets).
  root.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
}

/** The blocks from `start` on, until a heading of the same or higher level or the size cap. */
export function sectionHtml(start: Element): string {
  const level = isHeading(start) ? Number(start.tagName[1]) : 7;
  const box = document.createElement("div");
  let chars = 0;
  let blocks = 0;
  for (let el: Element | null = start; el; el = el.nextElementSibling) {
    if (el !== start && isHeading(el) && Number(el.tagName[1]) <= level) break;
    if (el.matches("section.footnotes")) break;
    box.appendChild(el.cloneNode(true));
    chars += (el.textContent ?? "").length;
    if (!isHeading(el)) blocks++;
    if (blocks >= MAX_BLOCKS || chars >= MAX_CHARS) break;
  }
  stripForPreview(box);
  return box.innerHTML;
}

/** The opening of a rendered document: everything up to the size cap. */
export function openingHtml(rendered: string, fragment: string | null): string {
  const tpl = document.createElement("template");
  tpl.innerHTML = rendered;
  const root = tpl.content;
  const target = fragment ? root.getElementById(fragment) : null;
  const start = target ?? root.firstElementChild;
  return start ? sectionHtml(start) : "";
}

/** Classify a link the pointer is over; null for links with nothing to preview. */
export function linkTarget(anchor: HTMLAnchorElement, page: HTMLElement): LinkTarget | null {
  const href = anchor.getAttribute("href") ?? "";
  if (!href || anchor.hasAttribute("data-footnote-backref")) return null;
  if (href.startsWith("#")) {
    const id = decodeURIComponent(href.slice(1));
    const target = page.querySelector(`[id="${CSS.escape(id)}"]`);
    if (!target) return null;
    if (anchor.hasAttribute("data-footnote-ref") || target.matches("section.footnotes li")) {
      const li = target.cloneNode(true) as Element;
      stripForPreview(li);
      const open = markCitations(li);
      return {
        kind: "footnote",
        label: `Footnote ${anchor.textContent?.trim() ?? ""}`,
        html: li.innerHTML,
        open,
      };
    }
    return {
      kind: "section",
      label: isHeading(target) ? "This document" : "Jump to",
      html: sectionHtml(target),
    };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { kind: "external", url: href };
  const [path, fragment] = href.split("#");
  if (!/\.(md|markdown)$/i.test(decodeURIComponent(path))) return null;
  return { kind: "doc", href, fragment: fragment ? decodeURIComponent(fragment) : null };
}
