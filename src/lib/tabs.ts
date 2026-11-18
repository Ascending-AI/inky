/**
 * Document tabs. Plain data so it can live inside Svelte `$state`; every
 * function mutates `set` in place.
 */

import {
  emptyHistory,
  forgetPath,
  renamePath as remapNav,
  type NavHistory,
} from "$lib/navhistory";
import { isInside, remapPath } from "$lib/paths";
import type { ViewMode } from "$lib/types";

export interface Tab {
  id: string;
  path: string;
  view: ViewMode;
  nav: NavHistory;
  /** Reading-pane scroll offset saved when the tab was left. */
  scroll: number | null;
}

export interface TabSet {
  tabs: Tab[];
  active: string | null;
}

export interface StoredTabs {
  tabs: { path: string; view: ViewMode }[];
  active: number;
}

const VIEWS: readonly string[] = ["preview", "split", "editor"];

export function emptyTabs(): TabSet {
  return { tabs: [], active: null };
}

export function activeTab(set: TabSet): Tab | null {
  return set.tabs.find((t) => t.id === set.active) ?? null;
}

export function findTab(set: TabSet, path: string): Tab | null {
  return set.tabs.find((t) => t.path === path) ?? null;
}

/** Open `path` in a tab, or focus the tab that already shows it. */
export function addTab(
  set: TabSet,
  path: string,
  view: ViewMode,
  opts: { background?: boolean } = {},
): { tab: Tab; existing: boolean } {
  const found = findTab(set, path);
  if (found) {
    if (!opts.background) set.active = found.id;
    return { tab: found, existing: true };
  }
  const tab: Tab = {
    id: crypto.randomUUID(),
    path,
    view,
    nav: emptyHistory(),
    scroll: null,
  };
  const at = set.tabs.findIndex((t) => t.id === set.active);
  set.tabs.splice(at < 0 ? set.tabs.length : at + 1, 0, tab);
  if (!opts.background || set.active === null) set.active = tab.id;
  return { tab, existing: false };
}

/** Close a tab; returns the id that is active afterwards (null if none left). */
export function closeTab(set: TabSet, id: string): string | null {
  const i = set.tabs.findIndex((t) => t.id === id);
  if (i < 0) return set.active;
  set.tabs.splice(i, 1);
  if (set.active === id) {
    set.active = (set.tabs[i] ?? set.tabs[i - 1])?.id ?? null;
  }
  return set.active;
}

/**
 * Edits that can't be left behind (a save conflict, or a save that failed)
 * pin the reader to the active tab until they are dealt with.
 */
export function canLeave(conflict: boolean, targetId: string, set: TabSet): boolean {
  return !conflict || targetId === set.active;
}

/** The tab to activate when stepping from the active one, wrapping around. */
export function cycleTab(set: TabSet, step: 1 | -1): string | null {
  const n = set.tabs.length;
  if (n < 2) return null;
  const i = set.tabs.findIndex((t) => t.id === set.active);
  return set.tabs[(i + step + n) % n].id;
}

export function moveTab(set: TabSet, id: string, toIndex: number) {
  const i = set.tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  const [tab] = set.tabs.splice(i, 1);
  const to = Math.max(0, Math.min(toIndex, set.tabs.length));
  set.tabs.splice(to, 0, tab);
}

/** A file or folder moved/renamed: rewrite tab paths and their histories. */
export function remapTabs(set: TabSet, from: string, to: string): boolean {
  let changed = false;
  for (const t of set.tabs) {
    const next = remapPath(t.path, from, to);
    if (next !== t.path) {
      t.path = next;
      changed = true;
    }
    remapNav(t.nav, from, to);
  }
  return changed;
}

/**
 * A file or folder was deleted: close tabs at or under it, except `keep`
 * (a tab whose unsaved edits stay open).
 */
export function dropTabs(set: TabSet, path: string, keep?: string): { activeClosed: boolean } {
  const activeIndex = set.tabs.findIndex((t) => t.id === set.active);
  const before = set.tabs;
  const kept = before.filter((t) => t.id === keep || !isInside(t.path, path));
  for (const t of kept) forgetPath(t.nav, path);
  set.tabs = kept;
  const activeClosed = activeIndex >= 0 && !kept.some((t) => t.id === set.active);
  if (activeClosed) {
    const right = before.slice(activeIndex + 1).find((t) => kept.includes(t));
    const left = before
      .slice(0, activeIndex)
      .reverse()
      .find((t) => kept.includes(t));
    set.active = (right ?? left)?.id ?? null;
  }
  return { activeClosed };
}

export function serializeTabs(set: TabSet): string {
  const stored: StoredTabs = {
    tabs: set.tabs.map((t) => ({ path: t.path, view: t.view })),
    active: Math.max(0, set.tabs.findIndex((t) => t.id === set.active)),
  };
  return JSON.stringify(stored);
}

/**
 * Tabs saved by `serializeTabs`; anything malformed reads as none. With no
 * saved value at all, the last open document (if any) becomes the one tab.
 */
export function parseTabs(raw: string | null, lastDoc: string | null): StoredTabs {
  if (raw === null) {
    return lastDoc
      ? { tabs: [{ path: lastDoc, view: "split" }], active: 0 }
      : { tabs: [], active: 0 };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { tabs: [], active: 0 };
  }
  const list = (data as { tabs?: unknown } | null)?.tabs;
  if (!Array.isArray(list)) return { tabs: [], active: 0 };
  const tabs: StoredTabs["tabs"] = [];
  for (const e of list) {
    if (typeof e?.path !== "string") continue;
    tabs.push({ path: e.path, view: VIEWS.includes(e.view) ? e.view : "split" });
  }
  const a = (data as { active?: unknown }).active;
  const active = typeof a === "number" && Number.isInteger(a) ? a : 0;
  return { tabs, active: Math.max(0, Math.min(active, tabs.length - 1)) };
}
