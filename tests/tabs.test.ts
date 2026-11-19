import { describe, expect, it } from "vitest";
import {
  addTab,
  canLeave,
  closeTab,
  cycleTab,
  dropTabs,
  emptyTabs,
  dragShift,
  dragTarget,
  moveTab,
  parseTabs,
  remapTabs,
  serializeTabs,
  type TabSet,
} from "$lib/tabs";

function setOf(...paths: string[]): TabSet {
  const set = emptyTabs();
  for (const p of paths) addTab(set, p, "split");
  return set;
}
const order = (set: TabSet) => set.tabs.map((t) => t.path);
const activePath = (set: TabSet) => set.tabs.find((t) => t.id === set.active)?.path;

describe("tab set", () => {
  it("addTab inserts after the active tab and focuses it", () => {
    const set = setOf("/a", "/b");
    set.active = set.tabs[0].id;
    addTab(set, "/c", "preview");
    expect(order(set)).toEqual(["/a", "/c", "/b"]);
    expect(activePath(set)).toBe("/c");
  });

  it("addTab focuses an already open document instead of duplicating", () => {
    const set = setOf("/a", "/b");
    expect(activePath(set)).toBe("/b");
    const r = addTab(set, "/a", "split");
    expect(r.existing).toBe(true);
    expect(set.tabs).toHaveLength(2);
    expect(activePath(set)).toBe("/a");
  });

  it("addTab background keeps the current tab", () => {
    const set = setOf("/a");
    addTab(set, "/b", "split", { background: true });
    expect(activePath(set)).toBe("/a");
    expect(order(set)).toEqual(["/a", "/b"]);
  });

  it("addTab background into an empty set still activates it", () => {
    const set = emptyTabs();
    const { tab } = addTab(set, "/a", "split", { background: true });
    expect(set.active).toBe(tab.id);
  });

  it("closeTab picks the right neighbour, then the left, then null", () => {
    const set = setOf("/a", "/b", "/c");
    set.active = set.tabs[1].id;
    closeTab(set, set.tabs[1].id);
    expect(activePath(set)).toBe("/c");
    closeTab(set, set.active!);
    expect(activePath(set)).toBe("/a");
    expect(closeTab(set, set.active!)).toBeNull();
    expect(set.active).toBeNull();
  });

  it("closeTab on a background tab keeps the active one", () => {
    const set = setOf("/a", "/b");
    const a = set.tabs[0].id;
    expect(closeTab(set, a)).toBe(set.active);
    expect(activePath(set)).toBe("/b");
  });

  it("cycleTab wraps both ways", () => {
    const set = setOf("/a", "/b", "/c");
    expect(set.tabs.find((t) => t.id === cycleTab(set, 1))?.path).toBe("/a");
    set.active = set.tabs[0].id;
    expect(set.tabs.find((t) => t.id === cycleTab(set, -1))?.path).toBe("/c");
    expect(cycleTab(setOf("/a"), 1)).toBeNull();
  });

  it("moveTab reorders", () => {
    const set = setOf("/a", "/b", "/c");
    moveTab(set, set.tabs[2].id, 0);
    expect(order(set)).toEqual(["/c", "/a", "/b"]);
  });

  it("dragTarget moves a tab aside once the dragged tab's leading edge passes its middle", () => {
    const w = [100, 100, 100, 100];
    expect(dragTarget(w, 0, 0)).toBe(0);
    expect(dragTarget(w, 0, 49)).toBe(0);
    expect(dragTarget(w, 0, 51)).toBe(1);
    expect(dragTarget(w, 0, 151)).toBe(2);
    expect(dragTarget(w, 0, 999)).toBe(3);
    expect(dragTarget(w, 3, -51)).toBe(2);
    expect(dragTarget(w, 3, -999)).toBe(0);
    expect(dragTarget(w, 2, 0)).toBe(2);
  });

  it("dragTarget handles tabs of different widths", () => {
    // Tab 0 (60 wide) dragged right: its right edge (60 + offset) passes tab 1's middle (160).
    expect(dragTarget([60, 200, 100], 0, 99)).toBe(0);
    expect(dragTarget([60, 200, 100], 0, 101)).toBe(1);
    // Tab 2 (starts at 260) dragged left: its left edge passes tab 1's middle (160).
    expect(dragTarget([60, 200, 100], 2, -99)).toBe(2);
    expect(dragTarget([60, 200, 100], 2, -101)).toBe(1);
  });

  it("dragShift slides the tabs between the old and new place by the dragged width", () => {
    // Dragging tab 1 (80 wide) to index 3: tabs 2 and 3 slide left.
    expect([0, 1, 2, 3, 4].map((j) => dragShift(j, 1, 3, 80))).toEqual([0, 0, -80, -80, 0]);
    // Dragging tab 3 to index 1: tabs 1 and 2 slide right.
    expect([0, 1, 2, 3, 4].map((j) => dragShift(j, 3, 1, 80))).toEqual([0, 80, 80, 0, 0]);
    expect(dragShift(2, 2, 2, 80)).toBe(0);
  });

  it("remapTabs follows a folder rename into every tab beneath it", () => {
    const set = setOf("/lib/R/a.md", "/lib/R/sub/b.md", "/lib/x.md", "/lib/Rx.md");
    set.tabs[2].nav.back.push({ path: "/lib/R/a.md", scroll: 0 });
    expect(remapTabs(set, "/lib/R", "/lib/S")).toBe(true);
    expect(order(set)).toEqual(["/lib/S/a.md", "/lib/S/sub/b.md", "/lib/x.md", "/lib/Rx.md"]);
    expect(set.tabs[2].nav.back[0].path).toBe("/lib/S/a.md");
    expect(remapTabs(set, "/nowhere", "/else")).toBe(false);
  });

  it("dropTabs closes tabs under a deleted folder and moves focus", () => {
    const set = setOf("/lib/R/a.md", "/lib/R/b.md", "/lib/c.md");
    set.active = set.tabs[0].id;
    expect(dropTabs(set, "/lib/R")).toEqual({ activeClosed: true });
    expect(order(set)).toEqual(["/lib/c.md"]);
    expect(activePath(set)).toBe("/lib/c.md");
  });

  it("dropTabs forgets the path in surviving tabs' history", () => {
    const set = setOf("/lib/c.md", "/lib/R/a.md");
    set.tabs[0].nav.back.push({ path: "/lib/R/a.md", scroll: 0 });
    expect(dropTabs(set, "/lib/R/a.md")).toEqual({ activeClosed: true });
    expect(set.tabs[0].nav.back).toEqual([]);
  });

  it("dropTabs spares the tab that keeps unsaved edits", () => {
    const set = setOf("/lib/R/a.md", "/lib/R/b.md", "/lib/c.md");
    const keep = set.tabs[0].id;
    set.active = keep;
    expect(dropTabs(set, "/lib/R", keep)).toEqual({ activeClosed: false });
    expect(order(set)).toEqual(["/lib/R/a.md", "/lib/c.md"]);
    expect(set.active).toBe(keep);
  });
});

describe("tab persistence", () => {
  it("serializeTabs and parseTabs round-trip paths, views and the active index", () => {
    const set = emptyTabs();
    addTab(set, "/a", "preview");
    addTab(set, "/b", "editor");
    addTab(set, "/c", "split");
    set.active = set.tabs[1].id;
    expect(parseTabs(serializeTabs(set), null)).toEqual({
      tabs: [
        { path: "/a", view: "preview" },
        { path: "/b", view: "editor" },
        { path: "/c", view: "split" },
      ],
      active: 1,
    });
  });

  it("parseTabs ignores junk", () => {
    expect(parseTabs("{oops", null)).toEqual({ tabs: [], active: 0 });
    expect(parseTabs('{"tabs":"x"}', null)).toEqual({ tabs: [], active: 0 });
    expect(
      parseTabs('{"tabs":[{"view":"editor"},{"path":"/a","view":"weird"}],"active":9}', null),
    ).toEqual({ tabs: [{ path: "/a", view: "split" }], active: 0 });
  });

  it("parseTabs migrates lastDoc once", () => {
    expect(parseTabs(null, "/a.md")).toEqual({
      tabs: [{ path: "/a.md", view: "split" }],
      active: 0,
    });
    expect(parseTabs('{"tabs":[],"active":0}', "/a.md").tabs).toEqual([]);
  });

  it("canLeave refuses to leave a conflicted tab", () => {
    const set = setOf("/a", "/b");
    const [a, b] = set.tabs;
    set.active = a.id;
    expect(canLeave(true, b.id, set)).toBe(false);
    expect(canLeave(true, a.id, set)).toBe(true);
    expect(canLeave(false, b.id, set)).toBe(true);
  });
});
