/**
 * The "leave the document" gate in AppState: every way of leaving the open
 * document (tab switch, close, open, quit) commits an in-place edit, saves,
 * and never leaves edits behind silently. Tauri is replaced by a fake disk.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const disk = new Map<string, string>();
let failWrites = false;
const invoke = vi.fn(async (cmd: string, args: Record<string, unknown> = {}): Promise<unknown> => {
  const path = args.path as string;
  switch (cmd) {
    case "read_doc":
      if (!disk.has(path)) throw `No such file: ${path}`;
      return disk.get(path);
    case "write_doc": {
      if (failWrites) throw "Permission denied";
      const now = disk.get(path);
      if (now !== args.expected) return { status: "conflict", disk: now };
      disk.set(path, args.content as string);
      return { status: "written" };
    }
    case "restore_tab":
    case "open_recent":
      throw "not listed";
    case "read_baseline":
      return null;
    case "doc_sidecars":
      return false;
    default:
      return undefined;
  }
});
const ask = vi.fn(async (_message: string, _opts?: unknown) => false);
const toast = { error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() };
const win = { setTitle: vi.fn(), destroy: vi.fn(), close: vi.fn(), onCloseRequested: vi.fn() };

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("@tauri-apps/api/path", () => ({ homeDir: vi.fn(async () => "/home") }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => win }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn(), ask }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ readText: vi.fn(), writeText: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast }));

type App = (typeof import("$lib/state.svelte"))["app"];
let app: App;

const A = "/lib/a.md";
const B = "/lib/b.md";
const C = "/lib/c.md";
const tabPaths = () => app.tabs.map((t) => t.path);
const tabId = (path: string) => app.tabs.find((t) => t.path === path)!.id;
const activePath = () => app.tabs.find((t) => t.id === app.activeTabId)?.path;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  disk.clear();
  disk.set(A, "alpha\n");
  disk.set(B, "bravo\n");
  disk.set(C, "charlie\n");
  failWrites = false;
  ask.mockResolvedValue(false);
  app = (await import("$lib/state.svelte")).app;
  // Two tabs, B showing.
  expect(await app.openInTab(A)).toBe(true);
  expect(await app.openInTab(B)).toBe(true);
  expect(app.currentPath).toBe(B);
});

const saveFailures = () => toast.error.mock.calls.filter(([m]) => String(m).startsWith("Save failed"));

describe("leaving a document", () => {
  it("saves unsaved edits before switching tabs", async () => {
    app.content = "bravo edited\n";
    expect(await app.activateTab(tabId(A))).toBe(true);
    expect(disk.get(B)).toBe("bravo edited\n");
    expect(app.currentPath).toBe(A);
    expect(app.content).toBe("alpha\n");
  });

  it("commits an in-place block edit before leaving", async () => {
    // What the Reading view registers while a block is being edited in place.
    app.commitInPlaceEdit = () => {
      app.content = "bravo, edited in place\n";
    };
    await app.closeTab(tabId(B));
    expect(disk.get(B)).toBe("bravo, edited in place\n");
    expect(tabPaths()).toEqual([A]);
    expect(app.currentPath).toBe(A);
  });

  it("is a no-op while a save conflict is showing", async () => {
    app.content = "mine\n";
    disk.set(B, "theirs\n");
    await app.save();
    expect(app.conflict).not.toBeNull();
    expect(await app.activateTab(tabId(A))).toBe(false);
    await app.closeTab(tabId(B));
    expect(await app.openInTab(C)).toBe(false);
    expect(await app.openDoc(C)).toBe(false);
    expect(activePath()).toBe(B);
    expect(tabPaths()).toEqual([A, B]);
    expect(app.currentPath).toBe(B);
    expect(app.content).toBe("mine\n");
    expect(ask).not.toHaveBeenCalled();
  });

  it("keeps the tab when a save fails and the reader stays", async () => {
    failWrites = true;
    app.content = "bravo edited\n";
    ask.mockResolvedValue(false);
    expect(await app.activateTab(tabId(A))).toBe(false);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][0]).toBe("Couldn't save b.md. Discard your changes?");
    expect(ask.mock.calls[0][1]).toMatchObject({ okLabel: "Discard", cancelLabel: "Stay" });
    // One failure is enough: no retry, so one toast.
    expect(saveFailures()).toHaveLength(1);
    expect(activePath()).toBe(B);
    expect(app.currentPath).toBe(B);
    expect(app.content).toBe("bravo edited\n");
    expect(app.dirty).toBe(true);
  });

  it("drops the edits and goes on when a save fails and the reader discards", async () => {
    failWrites = true;
    app.content = "bravo edited\n";
    ask.mockResolvedValue(true);
    expect(await app.activateTab(tabId(A))).toBe(true);
    expect(app.currentPath).toBe(A);
    expect(disk.get(B)).toBe("bravo\n");
    expect(tabPaths()).toEqual([A, B]);
  });

  it("asks before following a link away from edits that won't save", async () => {
    failWrites = true;
    app.content = "bravo edited\n";
    expect(await app.openDoc(C)).toBe(false);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(app.currentPath).toBe(B);
    expect(app.content).toBe("bravo edited\n");
  });

  it("goes Back only once the document can be left", async () => {
    expect(await app.openDoc(C)).toBe(true);
    expect(app.canGoBack).toBe(true);
    failWrites = true;
    app.content = "charlie edited\n";
    await app.goBack();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(saveFailures()).toHaveLength(1);
    expect(app.currentPath).toBe(C);
    expect(app.content).toBe("charlie edited\n");
    // History didn't move: Back still leads to B.
    expect(app.nav.back.map((e) => e.path)).toEqual([B]);
    expect(app.nav.forward).toEqual([]);
    failWrites = false;
    await app.goBack();
    expect(disk.get(C)).toBe("charlie edited\n");
    expect(app.currentPath).toBe(B);
  });

  it("drops a tab whose document can't be loaded", async () => {
    disk.delete(A);
    expect(await app.activateTab(tabId(A))).toBe(false);
    expect(tabPaths()).toEqual([B]);
    expect(app.currentPath).toBe(B);
  });
});

describe("quitting", () => {
  it("saves, then quits", async () => {
    app.content = "bravo edited\n";
    await app.quitApp();
    expect(disk.get(B)).toBe("bravo edited\n");
    expect(invoke).toHaveBeenCalledWith("quit_app");
  });

  it("commits an in-place edit before quitting", async () => {
    app.commitInPlaceEdit = () => {
      app.content = "bravo, edited in place\n";
    };
    await app.quitApp();
    expect(disk.get(B)).toBe("bravo, edited in place\n");
    expect(invoke).toHaveBeenCalledWith("quit_app");
  });

  it("stays open while a conflict is showing", async () => {
    app.content = "mine\n";
    disk.set(B, "theirs\n");
    await app.save();
    await app.quitApp();
    expect(invoke).not.toHaveBeenCalledWith("quit_app");
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks before quitting with edits that won't save", async () => {
    failWrites = true;
    app.content = "bravo edited\n";
    ask.mockResolvedValue(false);
    await app.quitApp();
    expect(ask.mock.calls[0][0]).toBe("Couldn't save b.md. Quit anyway?");
    expect(ask.mock.calls[0][1]).toMatchObject({ okLabel: "Quit", cancelLabel: "Cancel" });
    expect(invoke).not.toHaveBeenCalledWith("quit_app");
    ask.mockResolvedValue(true);
    await app.quitApp();
    expect(invoke).toHaveBeenCalledWith("quit_app");
  });
});
