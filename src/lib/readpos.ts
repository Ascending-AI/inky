/**
 * Where the reader was in each document, so reopening one resumes there.
 *
 * A position is anchored to the top visible block (index + a fingerprint of
 * its text + how far into it), not a pixel offset: pixels drift whenever the
 * reading width, font size or the document itself changes. The fingerprint
 * finds the block again after edits; the scroll fraction is the last resort.
 */

export interface ReadPos {
  /** Index of the top visible block among the document's top-level elements. */
  index: number;
  /** Start of that block's text, to find it again if blocks shift. */
  key: string;
  /** How far the viewport top is into that block (0–1). */
  offset: number;
  /** Overall scroll fraction (0–1). */
  fraction: number;
  /** When it was saved (epoch ms). */
  at: number;
}

const STORAGE_KEY = "inky.readPositions";
const CAP = 500;
/** Closer to the top than this and the document is "not started". */
const TOP_SLACK_PX = 24;

export function blockKey(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function load(): Record<string, ReadPos> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function store(map: Record<string, ReadPos>) {
  const entries = Object.entries(map);
  if (entries.length > CAP) {
    entries.sort((a, b) => b[1].at - a[1].at);
    map = Object.fromEntries(entries.slice(0, CAP));
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage full or unavailable: positions are a convenience.
  }
}

export function getPosition(path: string): ReadPos | null {
  return load()[path] ?? null;
}

/** Save `pos` for `path`; `null` (back at the top) forgets it. */
export function savePosition(path: string, pos: ReadPos | null) {
  const map = load();
  if (pos) map[path] = pos;
  else if (path in map) delete map[path];
  else return;
  store(map);
}

const within = (path: string, prefix: string) =>
  path === prefix || path.startsWith(prefix + "/");

/** A file or folder moved or was renamed: carry its positions along. */
export function remapPositions(from: string, to: string) {
  const map = load();
  let changed = false;
  for (const path of Object.keys(map)) {
    if (within(path, from)) {
      map[to + path.slice(from.length)] = map[path];
      delete map[path];
      changed = true;
    }
  }
  if (changed) store(map);
}

export function forgetPositions(prefix: string) {
  const map = load();
  let changed = false;
  for (const path of Object.keys(map)) {
    if (within(path, prefix)) {
      delete map[path];
      changed = true;
    }
  }
  if (changed) store(map);
}

/**
 * Which block a saved position points at now: the same index if its text
 * still matches, else the matching block nearest the old index, else none.
 */
export function resolveIndex(keys: string[], pos: Pick<ReadPos, "index" | "key">): number {
  if (keys[pos.index] === pos.key) return pos.index;
  if (!pos.key) return -1;
  let best = -1;
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== pos.key) continue;
    if (best < 0 || Math.abs(i - pos.index) < Math.abs(best - pos.index)) best = i;
  }
  return best;
}

/** Where the reading pane is now; null when it sits at the top. */
export function capturePosition(container: HTMLElement, scroller: HTMLElement): ReadPos | null {
  if (scroller.scrollTop < TOP_SLACK_PX) return null;
  const top = scroller.getBoundingClientRect().top;
  const blocks = Array.from(container.children);
  const index = blocks.findIndex((el) => el.getBoundingClientRect().bottom > top + 1);
  if (index < 0) return null;
  const rect = blocks[index].getBoundingClientRect();
  const max = scroller.scrollHeight - scroller.clientHeight;
  return {
    index,
    key: blockKey(blocks[index]),
    offset: rect.height > 0 ? Math.min(1, Math.max(0, (top - rect.top) / rect.height)) : 0,
    fraction: max > 0 ? Math.min(1, scroller.scrollTop / max) : 0,
    at: Date.now(),
  };
}

/** The scrollTop that puts `pos` back at the top of the pane. */
export function targetScrollTop(container: HTMLElement, scroller: HTMLElement, pos: ReadPos): number {
  const blocks = Array.from(container.children);
  const i = resolveIndex(blocks.map(blockKey), pos);
  if (i < 0) return pos.fraction * (scroller.scrollHeight - scroller.clientHeight);
  const rect = blocks[i].getBoundingClientRect();
  const top = scroller.getBoundingClientRect().top;
  return scroller.scrollTop + (rect.top - top) + pos.offset * rect.height;
}
