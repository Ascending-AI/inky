<script lang="ts">
  import { modKey, shortcut } from "$lib/platform";
  import { onMount, tick, untrack } from "svelte";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { app, type CommentDraft } from "$lib/state.svelte";
  import { toggleTaskMarker } from "$lib/tasks";
  import {
    renderMarkdown,
    countBlockedRemote,
    renderMermaidBlocks,
    resetMermaidTheme,
    extractBlocks,
    type SourceBlock,
  } from "$lib/markdown";
  import { registerScroller } from "$lib/scrollsync";
  import {
    wrapQuote,
    wrapAnchor,
    unwrapMarks,
    contextAround,
    flatText,
    textOffset,
    rangeFromOffsets,
    CONTEXT_CHARS,
  } from "$lib/comments";
  import { COLOR_KEYS, HIGHLIGHT_COLORS, readableText, type HighlightColor } from "$lib/highlights";
  import HighlightPopover from "./HighlightPopover.svelte";
  import Eraser from "@lucide/svelte/icons/eraser";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";
  import { htmlToMarkdown, spliceEdit } from "$lib/richedit";
  import { invoke } from "@tauri-apps/api/core";
  import { EditorView as CmEditorView, keymap as cmKeymap, drawSelection } from "@codemirror/view";
  import { StateEffect } from "@codemirror/state";
  import { history, defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { syntaxHighlighting, LanguageDescription } from "@codemirror/language";
  import { languages as codeLanguages } from "@codemirror/language-data";
  import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
  import { inkyHighlightStyle } from "$lib/cmtheme";
  import { toast } from "svelte-sonner";
  import Bold from "@lucide/svelte/icons/bold";
  import Italic from "@lucide/svelte/icons/italic";
  import Strikethrough from "@lucide/svelte/icons/strikethrough";
  import Code from "@lucide/svelte/icons/code";
  import Heading1 from "@lucide/svelte/icons/heading-1";
  import Heading2 from "@lucide/svelte/icons/heading-2";
  import Heading3 from "@lucide/svelte/icons/heading-3";
  import List from "@lucide/svelte/icons/list";
  import ListOrdered from "@lucide/svelte/icons/list-ordered";
  import TextQuote from "@lucide/svelte/icons/text-quote";
  import MessageSquarePlus from "@lucide/svelte/icons/message-square-plus";
  import CommentHoverCard from "./CommentHoverCard.svelte";
  import { capturePosition, getPosition, savePosition, targetScrollTop } from "$lib/readpos";
  import { linkTarget, openingHtml, targetName } from "$lib/linkpreview";
  import { END as CHANGES_END } from "$lib/changes";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import LinkPreviewCard, { type LinkPreview } from "./LinkPreviewCard.svelte";
  import type { MediaItem } from "./ZoomViewer.svelte";

  let container: HTMLDivElement | undefined = $state();
  let scroller: HTMLDivElement | undefined = $state();
  let html = $state("");
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let firstRender = true;

  function toHtml(src: string, isMermaidDoc: boolean, remoteImages: boolean): string {
    if (isMermaidDoc) {
      return `<div class="mermaid-block" data-mermaid="${encodeURIComponent(src)}"></div>`;
    }
    return renderMarkdown(src, { remoteImages });
  }

  /** Remote images and media the open document holds back (see $lib/markdown). */
  let blockedRemote = $state(0);

  // Debounced re-render while typing; instant on document switch.
  $effect(() => {
    const src = app.content;
    const isMermaid = app.isMermaidDoc;
    const remote = app.remoteImagesAllowed;
    app.currentPath;
    // Hold re-renders while a block is being edited in place (self-healing:
    // a stuck lock without a live session must never freeze rendering).
    healStuckSession();
    if (blockEditing) return;
    if (firstRender) {
      firstRender = false;
      html = toHtml(src, isMermaid, remote);
      return;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      html = toHtml(src, isMermaid, remote);
    }, 200);
  });

  // Local images can't load from raw file paths inside the webview; route
  // them through Tauri's asset protocol, resolved relative to the document.
  function resolveLocalImages(root: ParentNode | undefined = container, docPath = app.currentPath) {
    if (!root || !docPath) return;
    const dir = docPath.slice(0, docPath.lastIndexOf("/"));
    for (const img of root.querySelectorAll("img")) {
      const src = img.getAttribute("src") ?? "";
      if (!src || /^(https?:|data:|blob:|asset:|\/\/)/.test(src)) continue;
      const abs = src.startsWith("/") ? src : `${dir}/${src.replace(/^\.\//, "")}`;
      // Remember the markdown path so rich edits write it back unchanged.
      img.dataset.mdSrc = src;
      img.src = convertFileSrc(abs);
    }
  }

  // --- comment and reader highlights ---------------------------------------
  /** Re-wrap comment quotes and reader highlights (both anchor to text). */
  function applyMarks() {
    if (!container) return;
    unwrapMarks(container, "mark.comment-hl, mark.hl");
    const order: Record<string, number> = {};
    for (const t of app.commentThreads) {
      if (t.resolved) continue;
      const idx = wrapQuote(container, t);
      if (idx >= 0) order[t.id] = idx;
    }
    app.threadOrder = order;
    const hlOrder: Record<string, number> = {};
    for (const h of app.docHighlights) {
      let last = true; // segments are wrapped back to front
      const idx = wrapAnchor(container, h, () => {
        const mark = document.createElement("mark");
        mark.className = `hl hl-${h.color}`;
        mark.dataset.hlId = h.id;
        mark.title = "Click to change colour, add a note or remove";
        if (last && h.note) mark.dataset.note = "";
        last = false;
        return mark;
      });
      if (idx >= 0) hlOrder[h.id] = idx;
    }
    app.highlightOrder = hlOrder;
  }

  // Highlights added, recoloured, annotated or removed: redraw the marks.
  $effect(() => {
    for (const h of app.docHighlights) void (h.color + h.note);
    if (!container) return;
    tick().then(() => {
      if (!blockEditing) applyMarks();
      tryFocusHighlight();
    });
  });

  $effect(() => {
    if (app.focusHighlightId) tick().then(tryFocusHighlight);
  });

  /** Scroll to the highlight the panel asked for, once its mark exists. */
  function tryFocusHighlight() {
    const id = app.focusHighlightId;
    if (!id || !container) return;
    const marks = container.querySelectorAll<HTMLElement>(`mark.hl[data-hl-id="${CSS.escape(id)}"]`);
    if (!marks.length) return;
    app.focusHighlightId = null;
    marks[0].scrollIntoView({ behavior: "smooth", block: "center" });
    for (const m of marks) {
      m.classList.remove("hl-flash");
      void m.offsetWidth;
      m.classList.add("hl-flash");
    }
  }

  // --- highlight popover (click an existing highlight) -----------------------
  let hlPop = $state<{ id: string; x: number; y: number } | null>(null);
  const popHighlight = $derived(
    hlPop ? (app.docHighlights.find((h) => h.id === hlPop!.id) ?? null) : null,
  );

  function openHighlightPopover(mark: HTMLElement) {
    if (!scroller || !mark.dataset.hlId) return;
    const rect = mark.getBoundingClientRect();
    const srect = scroller.getBoundingClientRect();
    hlPop = {
      id: mark.dataset.hlId,
      x: Math.max(8, Math.min(rect.left - srect.left, srect.width - 296)),
      y: rect.bottom - srect.top + scroller.scrollTop + 6,
    };
  }

  /** Highlight the selected text (from the selection pill or the H key). */
  function highlightSelection(color: HighlightColor) {
    if (!selAction) return;
    let anchor: CommentDraft & { text?: string } = { ...selAction.draft, text: selAction.text };
    const overlaps = selOverlaps;
    // Touching existing highlights: merge them all into one span, so text is
    // never highlighted twice.
    if (overlaps.length && container) {
      const starts = overlaps.map((h) => app.highlightOrder[h.id]);
      const from = Math.min(selAction.start, ...starts);
      const to = Math.max(selAction.end, ...overlaps.map((h, i) => starts[i] + h.quote.length));
      const full = flatText(container);
      const range = rangeFromOffsets(container, from, to);
      anchor = {
        quote: full.slice(from, to),
        prefix: full.slice(Math.max(0, from - CONTEXT_CHARS), from),
        suffix: full.slice(to, to + CONTEXT_CHARS),
        text: range ? readableText(range) : undefined,
      };
    }
    selAction = null;
    // Capture first: committing an edit session replaces the DOM.
    if (blockEditing) {
      if (richWrapper) finishRichEdit(true);
      else rawFinish?.(true);
    }
    app.addHighlight(anchor, color, overlaps.map((h) => h.id));
    window.getSelection()?.removeAllRanges();
  }

  /** Remove the highlights the selection touches (selection pill). */
  function unhighlightSelection() {
    const ids = selOverlaps.map((h) => h.id);
    selAction = null;
    window.getSelection()?.removeAllRanges();
    app.removeHighlights(ids);
  }

  // Mermaid needs a second pass over the real DOM, and a full redo on theme change.
  $effect(() => {
    html;
    const theme = app.theme;
    app.commentThreads;
    if (!container) return;
    tick().then(async () => {
      if (container) {
        // Map blocks first so editing works immediately, even while mermaid
        // is still loading/rendering diagrams.
        computeBlockMap();
        blockedRemote = countBlockedRemote(container);
        await renderMermaidBlocks(container, theme);
        resolveLocalImages();
        applyMarks();
        // Back/forward: return to where the reader was (after diagrams have
        // their final height). Otherwise resume the saved reading position.
        if (app.pendingScroll !== null && scroller) {
          scroller.scrollTop = app.pendingScroll;
          app.pendingScroll = null;
          app.announceResume = false;
          positionSettled = true;
        } else if (!positionSettled) {
          resumeSavedPosition();
        }
        // A highlight picked in the panel wins over the resumed position.
        tryFocusHighlight();
      }
    });
  });

  // --- changes since last read (see $lib/changes) ---------------------------
  const CHANGE_CLASSES = ["chg-added", "chg-modified", "chg-removed-before", "chg-removed-after"];
  const CHANGE_SELECTOR = CHANGE_CLASSES.map((c) => `.${c}`).join(", ");
  /** Marked blocks in document order (the banner steps through these). */
  let changeEls = $state<HTMLElement[]>([]);
  let changeIdx = $state(-1);

  $effect(() => {
    html;
    app.changes;
    if (!container) return;
    tick().then(() => {
      computeBlockMap();
      applyChangeMarks();
    });
  });

  function applyChangeMarks() {
    if (!container) return;
    for (const el of container.querySelectorAll(CHANGE_SELECTOR)) el.classList.remove(...CHANGE_CLASSES);
    const c = app.changes;
    let last: Element | null = null;
    if (c) {
      for (const [el, block] of blockMap) {
        const text = app.content.slice(block.start, block.end).trim();
        if (c.changed.has(text)) el.classList.add(c.changed.get(text) === null ? "chg-added" : "chg-modified");
        if (c.removedBefore.has(text)) el.classList.add("chg-removed-before");
        last = el;
      }
      if (last && c.removedBefore.has(CHANGES_END)) last.classList.add("chg-removed-after");
    }
    changeEls = Array.from(container.querySelectorAll<HTMLElement>(CHANGE_SELECTOR));
    if (changeIdx >= changeEls.length) changeIdx = -1;
  }

  function gotoChange(step: 1 | -1) {
    if (changeEls.length === 0) return;
    changeIdx =
      changeIdx < 0
        ? step > 0
          ? 0
          : changeEls.length - 1
        : (changeIdx + step + changeEls.length) % changeEls.length;
    const el = changeEls[changeIdx];
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("chg-flash");
    void el.offsetWidth; // restart the animation
    el.classList.add("chg-flash");
  }

  /** Card with the earlier text of a changed block (gutter click). */
  function showChangeCard(el: HTMLElement) {
    const c = app.changes;
    const block = blockMap.get(el);
    if (!c || !block || !scroller) return;
    const text = app.content.slice(block.start, block.end).trim();
    const parts: string[] = [];
    const section = (title: string, md: string) =>
      `<p class="chg-card-title">${title}</p>${renderMarkdown(md, { remoteImages: app.remoteImagesAllowed })}`;
    const removed = [
      ...(c.removedBefore.get(text) ?? []),
      ...(el.classList.contains("chg-removed-after") ? (c.removedBefore.get(CHANGES_END) ?? []) : []),
    ];
    if (removed.length) parts.push(section("Removed here", removed.join("\n\n")));
    const old = c.changed.get(text);
    if (old) parts.push(section("Before", old));
    else if (old === null) parts.push(`<p class="chg-card-title">New since you last read</p>`);
    if (!parts.length) return;
    const tpl = document.createElement("template");
    tpl.innerHTML = parts.join("");
    resolveLocalImages(tpl.content);
    const rect = el.getBoundingClientRect();
    const srect = scroller.getBoundingClientRect();
    linkAnchor = null;
    linkCard = {
      label: "Since you last read",
      html: tpl.innerHTML,
      hint: "Click to close",
      open: null,
      innerLinks: false,
      x: Math.max(8, Math.min(rect.left - srect.left, srect.width - 360)),
      y: rect.top - srect.top + scroller.scrollTop + 4,
      above: false,
    };
  }

  // --- reading position (see $lib/readpos) ----------------------------------
  /** False until this mount has restored (or decided not to restore) a
   *  position; scroll events before that must not overwrite the saved one. */
  let positionSettled = false;
  let progress = $state(0);
  let resumed = $state(false);
  let resumedTimer: ReturnType<typeof setTimeout> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function resumeSavedPosition() {
    positionSettled = true;
    const announce = app.announceResume;
    app.announceResume = false;
    if (!container || !scroller || !app.currentPath || app.isMermaidDoc) return;
    const pos = getPosition(app.currentPath);
    if (!pos) return;
    const el = scroller;
    const box = container;
    el.scrollTop = targetScrollTop(box, el, pos);
    let applied = el.scrollTop;
    // Images without dimensions grow as they load; follow the anchor until
    // the reader scrolls on their own.
    for (const img of box.querySelectorAll("img")) {
      if (img.complete) continue;
      img.addEventListener(
        "load",
        () => {
          if (Math.abs(el.scrollTop - applied) > 2) return;
          el.scrollTop = targetScrollTop(box, el, pos);
          applied = el.scrollTop;
        },
        { once: true },
      );
    }
    if (announce && pos.fraction > 0.02) {
      resumed = true;
      resumedTimer = setTimeout(() => (resumed = false), 5000);
    }
  }

  function saveReadingPosition() {
    saveTimer = null;
    if (!positionSettled || !container || !scroller || !app.currentPath) return;
    // Mid-teardown or hidden panes have no layout; never save from those.
    if (!scroller.isConnected || scroller.clientHeight === 0) return;
    savePosition(app.currentPath, capturePosition(container, scroller));
  }

  function backToTop() {
    resumed = false;
    scroller?.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Emphasize the active thread's highlight.
  $effect(() => {
    const id = app.activeThreadId;
    if (!container) return;
    for (const m of container.querySelectorAll<HTMLElement>("mark.comment-hl")) {
      m.classList.toggle("active", m.dataset.threadId === id);
    }
  });

  // --- select-to-comment ---------------------------------------------------
  let selAction = $state<{
    x: number;
    y: number;
    draft: CommentDraft;
    text: string;
    /** The selection's span in the page text (see $lib/comments flatText). */
    start: number;
    end: number;
  } | null>(null);

  /** Highlights the current selection touches. */
  const selOverlaps = $derived.by(() => {
    const sel = selAction;
    if (!sel) return [];
    return app.docHighlights.filter((h) => {
      const at = app.highlightOrder[h.id];
      return at !== undefined && at < sel.end && at + h.quote.length > sel.start;
    });
  });

  function onMouseUp(e: MouseEvent) {
    if (e.target instanceof HTMLTextAreaElement) return;
    setTimeout(() => {
      const sel = window.getSelection();
      if (
        app.isMermaidDoc ||
        !sel ||
        sel.isCollapsed ||
        sel.rangeCount === 0 ||
        !container ||
        !scroller ||
        !container.contains(sel.getRangeAt(0).commonAncestorContainer)
      ) {
        selAction = null;
        return;
      }
      const range = sel.getRangeAt(0);
      // Selections inside a code-block editor are code editing, not commenting.
      const anchorEl =
        range.commonAncestorContainer instanceof Element
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;
      if (anchorEl?.closest(".block-edit-cm")) {
        selAction = null;
        return;
      }
      const quote = range.toString();
      if (!quote.trim() || quote.length > 1000) {
        selAction = null;
        return;
      }
      // Note: an alive edit session does NOT suppress the pill, and nothing is
      // committed here — committing replaces DOM nodes and would destroy the
      // visible selection. The session (if any) commits when the pill is used.
      const rect = range.getBoundingClientRect();
      const srect = scroller.getBoundingClientRect();
      selAction = {
        x: Math.max(8, Math.min(rect.right - srect.left - 120, srect.width - 380)),
        y: Math.max(4, rect.top - srect.top + scroller.scrollTop - 38),
        draft: { quote, ...contextAround(container, range) },
        text: readableText(range),
        start: textOffset(container, range.startContainer, range.startOffset),
        end: textOffset(container, range.endContainer, range.endOffset),
      };
    }, 0);
  }

  function createComment() {
    if (!selAction) return;
    const draft = selAction.draft;
    selAction = null;
    // Now that the draft text is captured, an in-place edit session can be
    // committed (this replaces DOM nodes, so it must come after the capture).
    if (blockEditing) {
      if (richWrapper) finishRichEdit(true);
      else rawFinish?.(true);
    }
    app.startCommentDraft(draft);
  }

  // --- in-place block editing (reading mode) --------------------------------
  let blockEditing = $state(false);
  $effect(() => {
    app.editingInPlace = blockEditing;
  });
  let blockMap = new Map<Element, SourceBlock>();

  /** Keep other blocks' source offsets valid after an edit changes lengths. */
  function shiftBlocks(after: number, delta: number) {
    if (!delta) return;
    for (const b of blockMap.values()) {
      if (b.start >= after) {
        b.start += delta;
        b.end += delta;
      }
    }
  }

  type CaretHint = MouseEvent | "start" | "end";

  /** Finisher of the active raw (CodeMirror) session, when one exists. */
  let rawFinish: ((commit: boolean) => void) | null = null;

  function sessionAlive(): boolean {
    return richWrapper !== null || rawFinish !== null;
  }

  /** blockEditing can only be true while a session exists; repair otherwise. */
  function healStuckSession() {
    if (blockEditing && !sessionAlive()) blockEditing = false;
  }

  function openBlockForEdit(el: HTMLElement, block: SourceBlock, caret: CaretHint) {
    if (el.tagName === "PRE" || el.querySelector("pre, .katex, sup a")) {
      startRawBlockEdit(el, block, caret === "end" ? "end" : "start");
    } else {
      startRichBlockEdit(el, block, caret);
    }
  }

  /** After leaving a block with ↑/↓, continue editing the adjacent one. */
  function navigateToSibling(fromEl: Element | null, dir: 1 | -1) {
    if (!fromEl) return;
    let el = dir === 1 ? fromEl.nextElementSibling : fromEl.previousElementSibling;
    while (el && !blockMap.has(el)) {
      el = dir === 1 ? el.nextElementSibling : el.previousElementSibling;
    }
    if (!el) return;
    const block = blockMap.get(el)!;
    const target = el as HTMLElement;
    requestAnimationFrame(() => openBlockForEdit(target, block, dir === 1 ? "start" : "end"));
  }

  /** Is the caret on the first (dir -1) or last (dir 1) visual line? */
  function caretAtBoundary(wrapper: HTMLElement, dir: 1 | -1): boolean {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return false;
    const range = sel.getRangeAt(0).cloneRange();
    const rects = range.getClientRects();
    const cr = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    if (!cr || (cr.width === 0 && cr.height === 0)) return true;
    const wr = wrapper.getBoundingClientRect();
    const lineHeight = cr.height || 20;
    return dir === 1
      ? wr.bottom - cr.bottom < lineHeight * 0.7
      : cr.top - wr.top < lineHeight * 0.7;
  }

  function normalizeText(s: string): string {
    return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  }

  function stripMdSyntax(s: string): string {
    // Line by line: a heading's text is kept whole, so "## 1. Results"
    // doesn't lose its "1." to the list-marker rule below.
    const lines = s.split("\n").map((line) => {
      const heading = line.match(/^\s{0,3}#{1,6}\s+(.*)$/);
      if (heading) return heading[1];
      return line
        .replace(/^\s{0,3}>\s?/, "")
        .replace(/^\s*([-*+]|\d+[.)])\s+\[[ xX]\]\s+/, "")
        .replace(/^\s*([-*+]|\d+[.)])\s+/, "");
    });
    return lines
      .join("\n")
      .replace(/^(`{3,}|~{3,}).*$/gm, "")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_~`|]/g, "");
  }

  /**
   * Align rendered top-level elements with source blocks, keeping only
   * pairs whose text plausibly matches — mismatches (footnote sections,
   * math, mermaid, reference defs) simply don't get an edit affordance.
   */
  function computeBlockMap() {
    blockMap = new Map();
    if (!container || app.isMermaidDoc) return;
    const blocks = extractBlocks(app.content);
    let bi = 0;
    for (const el of container.children) {
      const elNorm = normalizeText(el.textContent ?? "").slice(0, 32);
      if (!elNorm) continue;
      for (let j = bi; j < Math.min(bi + 6, blocks.length); j++) {
        const raw = app.content.slice(blocks[j].start, blocks[j].end);
        const bNorm = normalizeText(stripMdSyntax(raw)).slice(0, 32);
        if (!bNorm) continue;
        if (bNorm.startsWith(elNorm.slice(0, 16)) || elNorm.startsWith(bNorm.slice(0, 16))) {
          blockMap.set(el, blocks[j]);
          bi = j + 1;
          break;
        }
      }
    }
  }

  /** A double-click on a mapped block starts editing it in place. */
  function maybeStartBlockEdit(e: MouseEvent): boolean {
    healStuckSession();
    if (app.viewMode !== "preview" || blockEditing || !container) return false;
    const target = e.target as HTMLElement;
    // Leave links, comment highlights, form controls and diagrams alone.
    if (target.closest("a, mark.comment-hl, mark.hl, input, textarea, svg, .mermaid-block, .rich-edit"))
      return false;
    if (!window.getSelection()?.isCollapsed) return false;
    let el = target as HTMLElement | null;
    while (el && el.parentElement !== container) el = el.parentElement;
    if (!el) return false;
    const block = blockMap.get(el);
    if (!block) return false;
    openBlockForEdit(el, block, e);
    return true;
  }

  // --- WYSIWYG path: the block stays rendered and becomes contentEditable ---
  let richWrapper: HTMLDivElement | null = null;
  let richOriginalHtml = "";
  let richBlock: SourceBlock | null = null;
  let richInsert = false;
  let richSeps = { lead: "", tail: "" };
  let richBar = $state<{ x: number; y: number } | null>(null);

  function mountRichWrapper(el: HTMLElement): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "rich-edit";
    wrapper.contentEditable = "true";
    wrapper.spellcheck = true;
    el.replaceWith(wrapper);
    wrapper.appendChild(el);
    richWrapper = wrapper;

    if (scroller) {
      const rect = wrapper.getBoundingClientRect();
      const srect = scroller.getBoundingClientRect();
      richBar = {
        x: Math.max(8, Math.min(rect.left - srect.left, srect.width - 340)),
        y: Math.max(4, rect.top - srect.top + scroller.scrollTop - 40),
      };
    }

    wrapper.addEventListener("keydown", (ev) => {
      selAction = null; // typing invalidates a selection pill
      if (ev.key === "Escape") {
        ev.preventDefault();
        finishRichEdit(false);
      } else if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        finishRichEdit(true);
      } else if (
        (ev.key === "ArrowDown" || ev.key === "ArrowUp") &&
        !ev.shiftKey &&
        !modKey(ev) &&
        !ev.altKey
      ) {
        const dir = ev.key === "ArrowDown" ? 1 : -1;
        if (caretAtBoundary(wrapper, dir)) {
          ev.preventDefault();
          const from = finishRichEdit(true);
          navigateToSibling(from, dir);
        }
      }
      ev.stopPropagation();
    });
    wrapper.addEventListener("focusout", (ev) => {
      if (!wrapper.contains(ev.relatedTarget as Node | null)) finishRichEdit(true);
    });
    // Watchdog: if focus never lands in the wrapper (focus races, fast
    // clicks), no blur can end the session — retry once, then bail out so
    // the editing lock can't stick.
    setTimeout(() => {
      if (richWrapper === wrapper && !wrapper.contains(document.activeElement)) {
        wrapper.focus();
        setTimeout(() => {
          if (richWrapper === wrapper && !wrapper.contains(document.activeElement)) {
            finishRichEdit(true);
          }
        }, 150);
      }
    }, 150);
    return wrapper;
  }

  function startRichBlockEdit(el: HTMLElement, block: SourceBlock, caret: CaretHint) {
    blockEditing = true;
    richBlock = block;
    richInsert = false;
    richSeps = { lead: "", tail: "" };
    richOriginalHtml = el.outerHTML;
    const wrapper = mountRichWrapper(el);

    const point = caret instanceof MouseEvent ? { x: caret.clientX, y: caret.clientY } : caret;
    requestAnimationFrame(() => {
      if (richWrapper !== wrapper) return; // session already ended
      wrapper.focus();
      const sel = window.getSelection();
      // A selection made after the opening click (double-click word select,
      // fast drag) must survive — placing the caret would erase it.
      if (sel && !sel.isCollapsed) return;
      try {
        if (typeof point === "object") {
          const range = document.caretRangeFromPoint(point.x, point.y);
          if (range && wrapper.contains(range.startContainer)) {
            // Opened by a double-click: select the word, as double-clicking
            // text does, so typing replaces it.
            if (caret instanceof MouseEvent && caret.detail >= 2) expandToWord(range);
            sel?.removeAllRanges();
            sel?.addRange(range);
            return;
          }
        }
        const range = document.createRange();
        range.selectNodeContents(wrapper);
        range.collapse(point === "start");
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch {
        // keep default caret
      }
    });
  }

  /** Widen a collapsed range in a text node to the word around it. */
  function expandToWord(range: Range) {
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = node.nodeValue ?? "";
    const isWord = (c: string) => /[\p{L}\p{N}_'’-]/u.test(c);
    let from = range.startOffset;
    let to = range.startOffset;
    while (from > 0 && isWord(text[from - 1])) from--;
    while (to < text.length && isWord(text[to])) to++;
    if (from < to) {
      range.setStart(node, from);
      range.setEnd(node, to);
    }
  }

  /** Reading-pane keys: highlighting, closing popovers and edit sessions. */
  function onGlobalKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && hlPop) {
      hlPop = null;
      return;
    }
    if (
      selAction &&
      (e.key === "h" || e.key === "H") &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !(e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable='true'], .cm-editor")
    ) {
      e.preventDefault();
      highlightSelection(app.highlightColor);
      return;
    }
    if (e.key === "Escape" && linkCard) {
      hideLinkCard(0);
      return;
    }
    if (app.viewMode !== "preview" || app.isMermaidDoc || !container) return;
    healStuckSession();
    // Rescue hatch: Escape always ends whatever editing session exists,
    // even one that lost (or never got) focus.
    if (e.key === "Escape" && blockEditing) {
      if (richWrapper) finishRichEdit(false);
      else rawFinish?.(false);
      healStuckSession();
      return;
    }
    // Reading is read-only: keys never start an edit (a stray Space over a
    // selection used to replace it). Editing starts with a double-click.
  }

  /** Double-clicking the gap between blocks starts a fresh paragraph there. */
  function maybeStartGapEdit(e: MouseEvent): boolean {
    healStuckSession();
    if (app.viewMode !== "preview" || blockEditing || !container || app.isMermaidDoc) return false;
    const target = e.target as HTMLElement;
    if (target !== container && target !== scroller) return false;
    if (!window.getSelection()?.isCollapsed) return false;
    const crect = container.getBoundingClientRect();
    if (e.clientX < crect.left - 16 || e.clientX > crect.right + 16) return false;
    const children = [...container.children] as HTMLElement[];
    if (children.length === 0) return false;
    let next: HTMLElement | null = null;
    for (const child of children) {
      const r = child.getBoundingClientRect();
      if (r.top + r.height / 2 > e.clientY) {
        next = child;
        break;
      }
    }
    const prev = next ? (next.previousElementSibling as HTMLElement | null) : children.at(-1)!;
    const prevBlock = prev ? blockMap.get(prev) : undefined;
    const nextBlock = next ? blockMap.get(next) : undefined;
    let pos: number;
    if (prev && prevBlock) {
      pos = prevBlock.end;
      richSeps = { lead: "\n\n", tail: "" };
    } else if (next && nextBlock) {
      pos = nextBlock.start;
      richSeps = { lead: "", tail: "\n\n" };
    } else {
      return false;
    }

    blockEditing = true;
    richBlock = { start: pos, end: pos };
    richInsert = true;
    richOriginalHtml = "";
    const p = document.createElement("p");
    p.innerHTML = "<br>";
    if (next) next.before(p);
    else container.appendChild(p);
    const wrapper = mountRichWrapper(p);
    requestAnimationFrame(() => {
      wrapper.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.setStart(p, 0);
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
    return true;
  }

  function finishRichEdit(commit: boolean): Element | null {
    const wrapper = richWrapper;
    const block = richBlock;
    if (!wrapper || !block) return null;
    const isInsert = richInsert;
    const { lead, tail } = richSeps;
    richWrapper = null;
    richBlock = null;
    richInsert = false;
    richSeps = { lead: "", tail: "" };
    richBar = null;
    blockEditing = false;
    const html = wrapper.innerHTML;
    let restored: Element | null = null;
    if (isInsert) {
      const anchor = wrapper.previousElementSibling ?? wrapper.nextElementSibling;
      wrapper.remove();
      restored = anchor;
    } else if (html === richOriginalHtml && wrapper.firstElementChild) {
      // Untouched session: put the original node back as-is. Keeping identity
      // preserves any selection or drag anchored in it.
      restored = wrapper.firstElementChild;
      wrapper.replaceWith(restored);
    } else {
      const holder = document.createElement("div");
      holder.innerHTML = richOriginalHtml;
      restored = holder.firstElementChild;
      if (restored) wrapper.replaceWith(restored);
      else wrapper.remove();
    }
    if (!commit) {
      if (restored && !isInsert) blockMap.set(restored, block);
      return restored;
    }
    const md = htmlToMarkdown(html).trim();
    if (isInsert) {
      if (md) {
        const inserted = lead + md + tail;
        shiftBlocks(block.start, inserted.length);
        app.content = app.content.slice(0, block.start) + inserted + app.content.slice(block.end);
        app.scheduleAutosave();
      }
      return restored;
    }
    const original = app.content.slice(block.start, block.end);
    // What the block converts to unedited: the conversion is not faithful, so
    // comparing against the source would see changes nobody made.
    const unedited = html === richOriginalHtml ? md : htmlToMarkdown(richOriginalHtml).trim();
    if (md && md !== unedited) {
      // Splice just the edited span into the source; rewrite the block only
      // when that span can't be placed.
      const updated = spliceEdit(original.trim(), unedited, md) ?? md;
      const lead = original.length - original.trimStart().length;
      const trail = original.length - original.trimEnd().length;
      const next = original.slice(0, lead) + updated + original.slice(original.length - trail);
      shiftBlocks(block.end, next.length - (block.end - block.start));
      if (restored) blockMap.set(restored, { start: block.start, end: block.start + next.length });
      app.content = app.content.slice(0, block.start) + next + app.content.slice(block.end);
      app.scheduleAutosave();
    } else if (restored) {
      blockMap.set(restored, block);
    }
    return restored;
  }

  /** Toolbar actions for the rich editor (mousedown is prevented, so the
   *  selection inside the contentEditable block survives the click). */
  function execCmd(command: string, value?: string) {
    document.execCommand(command, false, value);
  }

  function toggleHeading(level: number) {
    const anchor = window.getSelection()?.anchorNode;
    const current =
      anchor instanceof Element
        ? anchor.closest("h1,h2,h3,h4,h5,h6")
        : anchor?.parentElement?.closest("h1,h2,h3,h4,h5,h6");
    const tag = `h${level}`;
    execCmd("formatBlock", current?.tagName.toLowerCase() === tag ? "<p>" : `<${tag}>`);
  }

  function toggleQuote() {
    const anchor = window.getSelection()?.anchorNode;
    const inQuote = (
      anchor instanceof Element ? anchor : anchor?.parentElement
    )?.closest("blockquote");
    if (inQuote) execCmd("outdent");
    else execCmd("formatBlock", "<blockquote>");
  }

  function toggleInlineCode() {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const anchor = sel.anchorNode;
    const inCode = (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest("code");
    if (inCode?.parentNode) {
      const parent = inCode.parentNode;
      while (inCode.firstChild) parent.insertBefore(inCode.firstChild, inCode);
      parent.removeChild(inCode);
      parent.normalize();
    } else {
      const range = sel.getRangeAt(0);
      if (range.collapsed) return;
      const code = document.createElement("code");
      try {
        range.surroundContents(code);
      } catch {
        // selection crosses element boundaries; skip
      }
    }
  }

  // --- raw source path (code fences, math, footnotes) ------------------------
  // A small embedded CodeMirror: real editing behavior (Enter, undo, indent)
  // plus syntax coloring in the fence's language.
  function startRawBlockEdit(el: HTMLElement, block: SourceBlock, caret: "start" | "end" = "start") {
    blockEditing = true;
    const original = app.content.slice(block.start, block.end);
    // For code blocks, edit only the code — keep the fence lines out of view.
    let prefix = "";
    let suffix = "";
    let inner = original;
    let fenceLang: string | null = null;
    const isCode = el.tagName === "PRE";
    if (isCode) {
      const m = original.match(
        /^(\s{0,3}(?:`{3,}|~{3,})([^\n]*)\n)([\s\S]*?)(\n\s{0,3}(?:`{3,}|~{3,})\s*)$/,
      );
      if (m) {
        prefix = m[1];
        fenceLang = m[2].trim() || null;
        inner = m[3];
        suffix = m[4];
      }
    }

    const host = document.createElement("div");
    host.className = "block-edit-cm";
    el.after(host);
    el.style.display = "none";

    let done = false;
    let view: CmEditorView | null = null;
    const finish = (commit: boolean) => {
      if (done || !view) return;
      done = true;
      rawFinish = null;
      blockEditing = false;
      const value = prefix + view.state.doc.toString() + suffix;
      view.destroy();
      host.remove();
      el.style.display = "";
      if (commit && value !== original) {
        shiftBlocks(block.end, value.length - (block.end - block.start));
        blockMap.set(el, { start: block.start, end: block.start + value.length });
        app.content = app.content.slice(0, block.start) + value + app.content.slice(block.end);
        app.scheduleAutosave();
      }
    };

    view = new CmEditorView({
      parent: host,
      doc: inner,
      extensions: [
        history(),
        drawSelection(),
        CmEditorView.lineWrapping,
        cmKeymap.of([
          { key: "Escape", run: () => (finish(false), true) },
          { key: "Mod-Enter", run: () => (finish(true), true) },
          {
            key: "ArrowDown",
            run: (v) => {
              const line = v.state.doc.lineAt(v.state.selection.main.head);
              if (line.number !== v.state.doc.lines) return false;
              finish(true);
              navigateToSibling(el, 1);
              return true;
            },
          },
          {
            key: "ArrowUp",
            run: (v) => {
              const line = v.state.doc.lineAt(v.state.selection.main.head);
              if (line.number !== 1) return false;
              finish(true);
              navigateToSibling(el, -1);
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        syntaxHighlighting(inkyHighlightStyle, { fallback: true }),
        CmEditorView.updateListener.of((u) => {
          if (u.focusChanged && !u.view.hasFocus) finish(true);
        }),
        ...(isCode ? [] : [markdown({ base: markdownLanguage })]),
      ],
    });
    if (fenceLang) {
      const desc = LanguageDescription.matchLanguageName(codeLanguages, fenceLang, true);
      desc?.load().then((support) => {
        if (!done) view?.dispatch({ effects: StateEffect.appendConfig.of(support) });
      });
    }
    rawFinish = finish;
    requestAnimationFrame(() => {
      if (!view) return;
      const pos = caret === "end" ? view.state.doc.length : 0;
      view.dispatch({ selection: { anchor: pos } });
      view.focus();
    });
    // Watchdog mirror of the rich path: never leave a focusless session.
    setTimeout(() => {
      if (!done && view && !view.hasFocus) {
        view.focus();
        setTimeout(() => {
          if (!done && view && !view.hasFocus) finish(true);
        }, 150);
      }
    }, 150);
  }

  // --- hover preview of comment threads ------------------------------------
  let hoverCard = $state<{ id: string; x: number; y: number } | null>(null);
  const hoverThread = $derived.by(() => {
    const hc = hoverCard;
    return hc ? (app.commentThreads.find((t) => t.id === hc.id) ?? null) : null;
  });

  // --- link and footnote previews (see $lib/linkpreview) --------------------
  let linkCard = $state<LinkPreview | null>(null);
  /** The link the pointer is over (or whose card is showing). */
  let linkAnchor: HTMLAnchorElement | null = null;
  let linkShowTimer: ReturnType<typeof setTimeout> | null = null;
  let linkHideTimer: ReturnType<typeof setTimeout> | null = null;
  /** Rendered openings of linked documents, by resolved path. */
  const docOpenings = new Map<string, string>();

  // A re-render replaces the link under the card; never leave it stranded.
  $effect(() => {
    void html;
    untrack(() => {
      linkCard = null;
      linkAnchor = null;
    });
  });

  function cancelLinkHide() {
    if (linkHideTimer) clearTimeout(linkHideTimer);
    linkHideTimer = null;
  }

  function hideLinkCard(delay = 160) {
    if (linkShowTimer) clearTimeout(linkShowTimer);
    linkShowTimer = null;
    cancelLinkHide();
    linkHideTimer = setTimeout(() => {
      linkCard = null;
      linkAnchor = null;
    }, delay);
  }

  function onLinkHover(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest?.(".link-preview")) return;
    const a = blockEditing ? null : target.closest?.<HTMLAnchorElement>("a[href]");
    const anchor = a && container?.contains(a) ? a : null;
    if (anchor === linkAnchor) {
      cancelLinkHide();
      return;
    }
    if (!anchor) {
      if (linkAnchor) hideLinkCard();
      return;
    }
    linkAnchor = anchor;
    cancelLinkHide();
    if (linkShowTimer) clearTimeout(linkShowTimer);
    // Moving from one link to the next while a card is up feels instant.
    linkShowTimer = setTimeout(() => showLinkCard(anchor), linkCard ? 60 : 350);
  }

  async function showLinkCard(anchor: HTMLAnchorElement) {
    linkShowTimer = null;
    if (!container || !scroller || anchor !== linkAnchor) return;
    const t = linkTarget(anchor, container);
    if (!t) {
      linkCard = null;
      return;
    }
    const href = anchor.getAttribute("href") ?? "";
    let content: Pick<LinkPreview, "label" | "html" | "url" | "hint" | "open" | "innerLinks">;
    if (t.kind === "external") {
      content = {
        label: "External link",
        html: "",
        url: t.url,
        hint: "Click to open in your browser",
        open: href,
        innerLinks: false,
      };
    } else if (t.kind === "doc") {
      const opening = await docOpening(t.href, t.fragment);
      if (!opening || anchor !== linkAnchor) return;
      content = { label: opening.label, html: opening.html, hint: "Click to open", open: href, innerLinks: false };
    } else if (t.kind === "footnote") {
      // The card already shows the footnote; clicking opens what it cites.
      if (!t.html.trim()) return;
      content = {
        label: t.label,
        html: t.html,
        hint: t.open ? `Click to open ${targetName(t.open)}` : "",
        open: t.open,
        innerLinks: true,
      };
    } else {
      if (!t.html.trim()) return;
      content = { label: t.label, html: t.html, hint: "Click to jump there", open: href, innerLinks: true };
    }
    const rect = anchor.getBoundingClientRect();
    const srect = scroller.getBoundingClientRect();
    const width = Math.min(352, srect.width - 16);
    const above = srect.bottom - rect.bottom < 300 && rect.top - srect.top > 300;
    linkCard = {
      ...content,
      x: Math.max(8, Math.min(rect.left - srect.left, srect.width - width - 8)),
      y: (above ? rect.top - 6 : rect.bottom + 6) - srect.top + scroller.scrollTop,
      above,
    };
  }

  async function docOpening(
    href: string,
    fragment: string | null,
  ): Promise<{ label: string; html: string } | null> {
    if (!app.currentPath) return null;
    try {
      const { path } = await invoke<{ path: string; doc: boolean }>("follow_link", {
        fromDoc: app.currentPath,
        href,
      });
      const key = `${path}#${fragment ?? ""}#${app.loadRemoteImages}`;
      let html = docOpenings.get(key);
      if (html === undefined) {
        const src = await invoke<string>("read_doc", { path });
        const tpl = document.createElement("template");
        tpl.innerHTML = openingHtml(renderMarkdown(src, { remoteImages: app.loadRemoteImages }), fragment);
        resolveLocalImages(tpl.content, path);
        html = tpl.innerHTML;
        docOpenings.set(key, html);
      }
      const name = path.split("/").pop()?.replace(/\.(md|markdown)$/i, "") ?? path;
      return html ? { label: name, html } : null;
    } catch {
      return null; // Missing target or link not saved yet: just no preview.
    }
  }

  function onHover(e: MouseEvent) {
    onLinkHover(e);
    const mark = (e.target as HTMLElement).closest?.<HTMLElement>("mark.comment-hl");
    if (mark?.dataset.threadId && scroller) {
      const rect = mark.getBoundingClientRect();
      const srect = scroller.getBoundingClientRect();
      hoverCard = {
        id: mark.dataset.threadId,
        x: Math.max(8, Math.min(rect.left - srect.left, srect.width - 280)),
        y: rect.bottom - srect.top + scroller.scrollTop + 6,
      };
    } else {
      hoverCard = null;
    }
  }

  $effect(() => {
    app.theme;
    resetMermaidTheme();
    // Force re-render of mermaid blocks with the new theme.
    untrack(() => {
      html = toHtml(app.content, app.isMermaidDoc, app.remoteImagesAllowed);
    });
  });

  // --- TOC scroll spy ------------------------------------------------------
  let spyRaf = 0;
  function onScroll(e: Event) {
    const scrollEl = e.currentTarget as HTMLElement;
    if (positionSettled && !saveTimer) saveTimer = setTimeout(saveReadingPosition, 400);
    if (spyRaf) return;
    spyRaf = requestAnimationFrame(() => {
      spyRaf = 0;
      const max = scrollEl.scrollHeight - scrollEl.clientHeight;
      progress = max > 0 ? Math.min(1, scrollEl.scrollTop / max) : 0;
      if (!container) return;
      const threshold = scrollEl.getBoundingClientRect().top + 90;
      let active: string | null = null;
      for (const h of container.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")) {
        if (h.getBoundingClientRect().top <= threshold) active = h.id;
        else break;
      }
      app.activeHeadingId = active ?? app.toc[0]?.id ?? null;
    });
  }

  // --- in-document search (wraps matches in <mark>) ------------------------
  let marks: HTMLElement[] = [];

  function searchClear() {
    for (const m of marks) {
      if (!m.isConnected) continue;
      const parent = m.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(m.textContent ?? ""), m);
      parent.normalize();
    }
    marks = [];
  }

  function searchUpdate(query: string): number {
    searchClear();
    if (!container || !query) return 0;
    const q = query.toLowerCase();
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) {
      // Wrapping <mark> inside SVG (mermaid) would corrupt the diagram.
      if (!n.parentElement?.closest("svg, mark.search-hit")) nodes.push(n as Text);
    }
    for (const node of nodes) {
      const text = node.nodeValue ?? "";
      const lower = text.toLowerCase();
      const hits: number[] = [];
      let i = 0;
      while ((i = lower.indexOf(q, i)) !== -1) {
        hits.push(i);
        i += q.length;
      }
      // Wrap from the end so earlier offsets stay valid.
      const nodeMarks: HTMLElement[] = [];
      for (let j = hits.length - 1; j >= 0; j--) {
        const range = document.createRange();
        range.setStart(node, hits[j]);
        range.setEnd(node, hits[j] + q.length);
        const mark = document.createElement("mark");
        mark.className = "search-hit";
        try {
          range.surroundContents(mark);
          nodeMarks.push(mark);
        } catch {
          // Range crossed a boundary; skip this occurrence.
        }
      }
      marks.push(...nodeMarks.reverse());
      if (marks.length > 2000) break;
    }
    return marks.length;
  }

  function searchGoto(i: number) {
    marks.forEach((m, j) => m.classList.toggle("active", j === i));
    marks[i]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  onMount(() => {
    app.searchBackends.preview = { update: searchUpdate, goto: searchGoto, clear: searchClear };
    app.previewScroller = scroller ?? null;
    const unregisterSync = scroller ? registerScroller("preview", scroller) : () => {};
    return () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveReadingPosition();
      }
      if (resumedTimer) clearTimeout(resumedTimer);
      delete app.searchBackends.preview;
      if (app.previewScroller === scroller) app.previewScroller = null;
      unregisterSync();
    };
  });

  /** Source-of-truth toggle for a task checkbox: flip the matching `[ ]`
   *  marker inside the clicked block's source range (see $lib/tasks); the
   *  re-render then reflects it. */
  function toggleTask(input: HTMLInputElement) {
    if (!container) return;
    let el: HTMLElement | null = input;
    while (el && el.parentElement !== container) el = el.parentElement;
    const block = el ? blockMap.get(el) : undefined;
    if (!el || !block) return;
    const boxes = Array.from(el.querySelectorAll("input.task-checkbox"));
    const updated = toggleTaskMarker(
      app.content,
      block.start,
      block.end,
      boxes.indexOf(input),
      boxes.length,
    );
    if (updated === null) return;
    app.content = updated;
    app.scheduleAutosave();
  }

  function handleClick(event: MouseEvent) {
    const chg = (event.target as HTMLElement).closest<HTMLElement>(CHANGE_SELECTOR);
    if (chg && event.clientX < chg.getBoundingClientRect().left) {
      showChangeCard(chg);
      return;
    }
    if (linkCard) hideLinkCard(0);
    const checkbox = (event.target as HTMLElement).closest<HTMLInputElement>("input.task-checkbox");
    if (checkbox) {
      // The source update drives the re-render; don't let the DOM state fork.
      event.preventDefault();
      toggleTask(checkbox);
      return;
    }
    if (hlPop) {
      hlPop = null;
      if ((event.target as HTMLElement).closest("mark.hl")) return;
    }
    const mark = (event.target as HTMLElement).closest<HTMLElement>("mark.comment-hl");
    if (mark?.dataset.threadId) {
      app.openThread(mark.dataset.threadId);
      return;
    }
    const hlMark = (event.target as HTMLElement).closest<HTMLElement>("mark.hl");
    if (hlMark && window.getSelection()?.isCollapsed !== false) {
      openHighlightPopover(hlMark);
      return;
    }
    const anchor = (event.target as HTMLElement).closest("a");
    if (anchor) {
      hideLinkCard(0);
      // Never let a link navigate the webview itself (that's how you end up
      // on an unescapable 404 page).
      event.preventDefault();
      handleLink(anchor.getAttribute("href") ?? "");
      return;
    }
    const media = (event.target as HTMLElement).closest<Element>("img, .mermaid-block svg");
    if (media && container?.contains(media) && !media.closest(".rich-edit")) {
      openMediaViewer(media);
      return;
    }
  }

  /** Double-click: edit the block (or the gap between blocks) in place. A
   *  single click never edits, so reading can't change a document. */
  function handleDblClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.closest("mark.hl, mark.comment-hl, a, img, .mermaid-block, .link-preview, .highlight-popover"))
      return;
    selAction = null;
    // The double-click selected a word; edit from a caret instead.
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) sel.collapseToStart();
    if (maybeStartBlockEdit(event)) return;
    maybeStartGapEdit(event);
  }

  /** Zoom the clicked image or diagram; ← / → step through the others. */
  function openMediaViewer(clicked: Element) {
    if (!container) return;
    const els = Array.from(container.querySelectorAll("img, .mermaid-block svg")).filter(
      (el) => !el.closest(".rich-edit") && !(el.tagName === "IMG" && el.closest("svg")),
    );
    let diagrams = 0;
    const items: MediaItem[] = els.map((el) => {
      if (el instanceof HTMLImageElement) {
        const name = decodeURIComponent((el.dataset.mdSrc ?? el.src).split("/").pop() ?? "Image");
        return { kind: "img", src: el.currentSrc || el.src, title: el.alt || name };
      }
      diagrams++;
      return { kind: "svg", svg: el.outerHTML, title: `Diagram ${diagrams}` };
    });
    app.openMedia(items, Math.max(0, els.indexOf(clicked)));
  }

  async function handleLink(href: string) {
    if (!href) return;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      // External scheme (https, mailto, …) → the user's default apps.
      import("@tauri-apps/plugin-opener").then(({ openUrl }) =>
        openUrl(href).catch(() => toast.error(`Could not open ${href}`)),
      );
      return;
    }
    if (href.startsWith("#")) {
      document
        .getElementById(decodeURIComponent(href.slice(1)))
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    // Relative link: Rust resolves it against the current document (and
    // grants Markdown targets outside the library). The href goes through raw,
    // and the source must be saved so Rust can check the link is really there.
    if (!app.currentPath) return;
    if (app.dirty) await app.save();
    invoke<{ path: string; doc: boolean }>("follow_link", {
      fromDoc: app.currentPath,
      href,
    })
      .then(async ({ path, doc }) => {
        if (doc) {
          app.openDoc(path);
        } else {
          const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
          revealItemInDir(path);
        }
      })
      .catch((e) => toast.error(String(e)));
  }
</script>

<svelte:window onkeydown={onGlobalKeydown} />

<div class="print-root relative h-full">
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events, a11y_mouse_events_have_key_events -->
<div
  bind:this={scroller}
  class="print-scroll relative h-full cursor-text overflow-y-auto px-8 py-10"
  onclick={handleClick}
  ondblclick={handleDblClick}
  onscroll={onScroll}
  onmouseup={onMouseUp}
  onmouseover={onHover}
  onmouseleave={() => {
    hoverCard = null;
    if (linkAnchor) hideLinkCard();
  }}
>
  <!-- Room for the changes banner, so it never covers the title. -->
  <div class="prose-doc" class:has-banner={!!app.changes} bind:this={container}>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized via DOMPurify -->
    {@html html}
  </div>
  {#if selAction}
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div
      class="no-print absolute z-20 flex items-center gap-1 rounded-full border bg-popover p-1 shadow-md"
      style="left: {selAction.x}px; top: {selAction.y}px"
      onmousedown={(e) => e.preventDefault()}
      onclick={(e) => e.stopPropagation()}
    >
      {#each COLOR_KEYS as key (key)}
        <button
          class="size-5 rounded-full border border-black/10 transition-transform hover:scale-115
            {app.highlightColor === key ? 'ring-2 ring-ring ring-offset-1 ring-offset-popover' : ''}"
          style="background: {HIGHLIGHT_COLORS[key].value}"
          title="Highlight {HIGHLIGHT_COLORS[key].label.toLowerCase()}{app.highlightColor === key
            ? ' (H)'
            : ''}"
          onclick={() => highlightSelection(key)}
        ></button>
      {/each}
      {#if selOverlaps.length}
        <button
          class="ml-0.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors hover:bg-accent"
          title={selOverlaps.length === 1 ? "Remove this highlight" : `Remove ${selOverlaps.length} highlights`}
          onclick={unhighlightSelection}
        >
          <Eraser class="size-3.5" /> Remove
        </button>
      {/if}
      {#if app.docSidecars}
        <div class="mx-0.5 h-4 w-px bg-border"></div>
        <button
          class="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-colors hover:bg-accent"
          onclick={createComment}
        >
          <MessageSquarePlus class="size-3.5" /> Comment
        </button>
      {/if}
    </div>
  {/if}
  {#if hlPop && popHighlight}
    {#key hlPop.id}
      <HighlightPopover
        highlight={popHighlight}
        x={hlPop.x}
        y={hlPop.y}
        onclose={() => (hlPop = null)}
      />
    {/key}
  {/if}
  {#if linkCard}
    <LinkPreviewCard
      preview={linkCard}
      onenter={cancelLinkHide}
      onleave={() => hideLinkCard()}
      onopen={(href) => {
        hideLinkCard(0);
        if (href) handleLink(href);
      }}
    />
  {/if}
  {#if hoverThread && hoverCard}
    <CommentHoverCard thread={hoverThread} x={hoverCard.x} y={hoverCard.y} />
  {/if}
  {#if richBar}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="no-print absolute z-30 flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-md"
      style="left: {richBar.x}px; top: {richBar.y}px"
      onmousedown={(e) => e.preventDefault()}
    >
      {#each [
        { icon: Bold, title: shortcut("Bold (⌘B)"), action: () => execCmd("bold") },
        { icon: Italic, title: shortcut("Italic (⌘I)"), action: () => execCmd("italic") },
        { icon: Strikethrough, title: "Strikethrough", action: () => execCmd("strikethrough") },
        { icon: Code, title: "Inline code", action: toggleInlineCode },
      ] as b (b.title)}
        <button
          class="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={b.title}
          onclick={b.action}
        >
          <b.icon class="size-3.5" />
        </button>
      {/each}
      <div class="mx-0.5 h-4 w-px bg-border"></div>
      {#each [
        { icon: Heading1, title: "Heading 1", action: () => toggleHeading(1) },
        { icon: Heading2, title: "Heading 2", action: () => toggleHeading(2) },
        { icon: Heading3, title: "Heading 3", action: () => toggleHeading(3) },
      ] as b (b.title)}
        <button
          class="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={b.title}
          onclick={b.action}
        >
          <b.icon class="size-3.5" />
        </button>
      {/each}
      <div class="mx-0.5 h-4 w-px bg-border"></div>
      {#each [
        { icon: List, title: "Bullet list", action: () => execCmd("insertUnorderedList") },
        { icon: ListOrdered, title: "Numbered list", action: () => execCmd("insertOrderedList") },
        { icon: TextQuote, title: "Quote", action: toggleQuote },
      ] as b (b.title)}
        <button
          class="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={b.title}
          onclick={b.action}
        >
          <b.icon class="size-3.5" />
        </button>
      {/each}
    </div>
  {/if}
</div>
  <!-- Pinned to the pane's top edge, outside the scroller: the progress bar,
       changes banner and resume pill float over the document. (Not sticky
       inside the scroller: WebKit sticks below its padding, mid-text.) -->
  <div class="no-print pointer-events-none absolute inset-x-0 top-0 z-20 h-0">
    {#if !app.isMermaidDoc}
      <div
        class="absolute inset-x-0 top-0 h-0.5 origin-left bg-primary/50 transition-transform duration-150"
        style="transform: scaleX({progress})"
      ></div>
    {/if}
    {#if app.changes}
      <div class="absolute inset-x-0 top-3 flex justify-center">
        <div
          class="pointer-events-auto flex items-center gap-1 rounded-full border bg-popover py-1 pr-1 pl-3 text-xs shadow-md"
        >
          <span class="chg-dot mr-1 size-2 rounded-full"></span>
          <span class="mr-1">
            {#if changeEls.length}
              {changeEls.length} {changeEls.length === 1 ? "change" : "changes"} since you last read
            {:else}
              Changed since you last read
            {/if}
          </span>
          {#if changeEls.length}
            <button
              class="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Previous change"
              onclick={(e) => {
                e.stopPropagation();
                gotoChange(-1);
              }}
            >
              <ChevronUp class="size-3.5" />
            </button>
            <button
              class="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Next change"
              onclick={(e) => {
                e.stopPropagation();
                gotoChange(1);
              }}
            >
              <ChevronDown class="size-3.5" />
            </button>
          {/if}
          <button
            class="rounded-full px-2 py-0.5 font-medium transition-colors hover:bg-accent"
            onclick={(e) => {
              e.stopPropagation();
              app.markAsRead();
            }}
          >
            Mark as read
          </button>
        </div>
      </div>
    {/if}
    {#if resumed}
      <div class="absolute inset-x-0 flex justify-center {app.changes ? 'top-13' : 'top-3'}">
        <div
          class="pointer-events-auto flex items-center gap-2 rounded-full border bg-popover py-1 pr-1 pl-3 text-xs shadow-md"
        >
          <span class="text-muted-foreground">Resumed where you left off</span>
          <button
            class="rounded-full px-2 py-0.5 font-medium transition-colors hover:bg-accent"
            onclick={(e) => {
              e.stopPropagation();
              backToTop();
            }}
          >
            Back to top
          </button>
        </div>
      </div>
    {/if}
  </div>
  {#if blockedRemote > 0 && !app.remoteImagesAllowed}
    <div class="no-print pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
      <div
        class="pointer-events-auto flex items-center gap-1 rounded-full border bg-popover py-1 pr-1 pl-3 text-xs shadow-md"
      >
        <ShieldCheck class="mr-0.5 size-3.5 text-muted-foreground" />
        <span class="mr-1 text-muted-foreground">
          {blockedRemote} remote {blockedRemote === 1 ? "image" : "images"} blocked
        </span>
        <button
          class="rounded-full px-2 py-0.5 font-medium transition-colors hover:bg-accent"
          title="Load this document's remote images until Inky quits"
          onclick={() => app.allowRemoteImagesHere()}
        >
          Load
        </button>
        <button
          class="rounded-full px-2 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Always load remote images (change in Reading settings)"
          onclick={() => app.setLoadRemoteImages(true)}
        >
          Always
        </button>
      </div>
    </div>
  {/if}
</div>
