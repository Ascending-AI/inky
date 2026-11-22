import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { homeDir } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "svelte-sonner";
import { EditorView } from "@codemirror/view";
import type { OpenRequest, PathChange, TreeNode, ViewMode } from "./types";
import { BUILT_IN, LIGHT } from "./themes/builtin";
import { applyThemeTo } from "./themes/apply";
import { parseTheme, serializeTheme, type Theme } from "./themes/model";
import {
  activeOrFallback,
  customFile,
  editedTheme,
  loadThemeFiles,
  orderThemes,
  slugFor,
  themeGroup,
  pushRecent,
  uniqueName,
  withCustom,
  type EditState,
} from "./themes/library";
import { WELCOME_DOC, MERMAID_TEMPLATE } from "./templates";
import { extractToc, type TocEntry } from "./markdown";
import { isImagePath, isInside, isVideoPath, parsePathList, remapPath } from "./paths";
import { SvelteSet } from "svelte/reactivity";
import { capturePosition, forgetPositions, remapPositions, targetScrollTop } from "./readpos";
import { baselineAfterEdit, diffBlocks, merge3, type ChangeSet, type MergeConflict } from "./changes";
import {
  forgetInStore,
  isColor,
  parseStore,
  remapStore,
  type Highlight,
  type HighlightColor,
  type HighlightStore,
} from "./highlights";
import type { TextAnchor } from "./comments";
import type { MediaItem } from "./components/ZoomViewer.svelte";
import {
  DEFAULT_TYPOGRAPHY,
  loadTypography,
  saveTypography,
  typographyVars,
  type Typography,
} from "./typography";
import { lockSync } from "./scrollsync";
import { newId, type CommentThread } from "./comments";
import {
  emptyHistory,
  forgetPath,
  goBack,
  goForward,
  recordVisit,
  renamePath,
  type NavEntry,
  type NavHistory,
} from "./navhistory";
import { FONT_SCALES, clampScale, stepScale } from "./zoom";
import { applyStamps } from "./imagestamps";
import { displayLog } from "./displaylog";
import { changesTree, type WatchChange } from "./librarychange";
import { rememberPosition, resumeAt } from "./videotime";
import {
  activeTab,
  addTab,
  canLeave,
  closeTab as removeTab,
  cycleTab,
  dropTabs,
  emptyTabs,
  findTab,
  moveTab as placeTab,
  parseTabs,
  remapTabs,
  serializeTabs,
  type Tab,
  type TabSet,
} from "./tabs";

export type { CommentThread };
export type CommentFilter = "all" | "open" | "resolved";

export interface CommentDraft {
  quote: string;
  prefix: string;
  suffix: string;
}

export type { TocEntry };

export { FONT_SCALES };

export const READING_WIDTHS = {
  default: { label: "Default", value: "58rem" },
  wide: { label: "Wide", value: "66rem" },
  xwide: { label: "Wider", value: "76rem" },
  xxwide: { label: "Widest", value: "88rem" },
  full: { label: "Full", value: "100%" },
} as const;
export type ReadingWidth = keyof typeof READING_WIDTHS;

interface OpenOptions {
  silent?: boolean;
  /** History navigation: restore this offset, record no visit. */
  restoreScroll?: number;
  /** Showing a tab: record no visit in its history. */
  fromTab?: boolean;
}

/**
 * How a load went. "blocked": a save conflict holds the open document.
 * "superseded": a later load took over before this one finished.
 */
type Load = "loaded" | "failed" | "blocked" | "superseded";

interface TabPlace {
  active: string | null;
  nav: NavHistory;
  view: ViewMode;
}

export interface SearchBackend {
  /** Recompute matches for a query; returns the match count. */
  update(query: string): number;
  /** Scroll to and highlight match `i` (0-based). */
  goto(i: number): void;
  clear(): void;
}

class AppState {
  libraryRoot = $state("");
  /** Folder opened from outside the library, shown in the sidebar instead of it. */
  workspace = $state<string | null>(null);
  activeRoot = $derived(this.workspace ?? this.libraryRoot);
  /** False for documents outside the library: no comments, no history. */
  docSidecars = $state(true);
  homeDir = $state("");
  recentDocs = $state<string[]>([]);
  tree = $state<TreeNode[]>([]);
  /** List `.inkyignore`d items in the sidebar (dimmed). */
  showHidden = $state(false);
  /** Sidebar folders the reader expanded (absolute paths); all others start closed. */
  expandedDirs = new SvelteSet<string>();
  /** Local images replaced on disk this session: path → stamp (see $lib/imagestamps). */
  imageVersions = $state<Record<string, string>>({});
  /** Where each video was left (see $lib/videotime); not reactive. */
  #videoPositions: Record<string, number> = {};
  /** A timestamp link waiting for its video tab to load. */
  #videoSeek: { path: string; time: number } | null = null;
  #imageStamps = new Map<string, string>();
  currentPath = $state<string | null>(null);
  /** What changed in the open document since the reader last read it. */
  changes = $state<ChangeSet | null>(null);
  /** The open document as the reader last read it (see $lib/changes). */
  #baseline: string | null = null;
  /** Image shown in the preview overlay (over the open document), if any. */
  imagePath = $state<string | null>(null);
  /** Images and diagrams of the open document, zoomed in the viewer. */
  mediaView = $state<{ items: MediaItem[]; index: number } | null>(null);
  /** An image or diagram viewer covers the document. */
  viewerOpen = $derived(this.imagePath !== null || this.mediaView !== null);
  content = $state("");
  savedContent = $state("");
  themeId = $state("light");
  themes = $state<Theme[]>([...BUILT_IN]);
  activeTheme = $derived(this.themes.find((t) => t.id === this.themeId) ?? LIGHT);
  themeKind = $derived(this.activeTheme.kind);
  /** Bumped on every apply; things that render colours (diagrams) redo on it. */
  themeVersion = $state(0);
  themeEditorVisible = $state(false);
  /** The Themes panel (every theme, as preview cards) on the right. */
  themesPanelVisible = $state(false);
  /** Recently used ready-made themes, newest first (see pushRecent). */
  recentThemeIds = $state<string[]>([]);
  /** The theme the saved Custom started from (its `basedOn`). */
  customBasedOn = $state<string | null>(null);
  #customTimer: ReturnType<typeof setTimeout> | null = null;
  viewMode = $state<ViewMode>("split");
  fontScale = $state(1);
  readingWidth = $state<ReadingWidth>("default");
  typography = $state<Typography>({ ...DEFAULT_TYPOGRAPHY });
  tocVisible = $state(false);
  activeHeadingId = $state<string | null>(null);
  syncScroll = $state(true);
  searchOpen = $state(false);
  sidebarVisible = $state(true);
  focusMode = $state(false);
  quickOpenVisible = $state(false);
  librarySearchVisible = $state(false);
  historyVisible = $state(false);
  /** Query the in-document search bar should run once it opens. */
  pendingSearchQuery: string | null = null;
  /** URL of the app-hosted MCP server while it's running. */
  mcpUrl = $state<string | null>(null);
  mcpSetupOpen = $state(false);

  /**
   * Open documents. Only the active tab is loaded: `currentPath`, `content`,
   * `nav` and `viewMode` are its values, swapped in and out on a switch.
   */
  tabSet = $state<TabSet>(emptyTabs());
  tabs = $derived(this.tabSet.tabs);
  activeTabId = $derived(this.tabSet.active);

  /** Back/forward between documents in the active tab (link clicks, sidebar…). */
  nav = $state(emptyHistory());
  canGoBack = $derived(this.nav.back.length > 0);
  canGoForward = $derived(this.nav.forward.length > 0);
  /** Set by the Preview component while mounted. */
  previewScroller: HTMLElement | null = null;
  /** Scroll offset the next mounted Preview should restore (history nav). */
  pendingScroll: number | null = null;
  /** Set when a document is opened, so the Preview announces a resumed
   *  position then, and not when it is merely re-mounted (view switch). */
  announceResume = false;

  /**
   * The open document changed on disk (an agent, another app) in the same
   * places the reader edited. The conflict dialog is up; autosave holds off
   * until the reader picks. `savedContent` already holds `theirs`.
   */
  conflict = $state<{
    path: string;
    mine: string;
    theirs: string;
    /** Their version with the reader's other (non-clashing) edits merged in. */
    merged: string;
    conflicts: MergeConflict[];
  } | null>(null);
  /** A block is being edited in place in the reading pane (see Preview). */
  #editingInPlace = false;
  /**
   * Set by the Preview while mounted: commits a block being edited in place
   * into `content` (its text reaches `content` only when the edit ends).
   */
  commitInPlaceEdit: (() => void) | null = null;
  /** Bumped whenever a load replaces the document; an in-place edit begun
   *  under an older one never lands in this one. */
  docLoads = 0;
  /** A disk change arrived during an in-place edit; check once it ends. */
  #diskCheckPending = false;

  get editingInPlace() {
    return this.#editingInPlace;
  }
  set editingInPlace(on: boolean) {
    this.#editingInPlace = on;
    if (!on && this.#diskCheckPending) {
      this.#diskCheckPending = false;
      this.syncFromDisk();
    }
  }

  commentsVisible = $state(false);
  highlightsVisible = $state(false);
  /** Every document's highlights, by path (see $lib/highlights). */
  highlightStore = $state<HighlightStore>({});
  docHighlights = $derived<Highlight[]>(
    this.currentPath ? (this.highlightStore[this.currentPath] ?? []) : [],
  );
  /** Where each of the open document's highlights sits (missing = text gone). */
  highlightOrder = $state<Record<string, number>>({});
  /** Colour for the next highlight (the last one used). */
  highlightColor = $state<HighlightColor>("yellow");
  /** Load remote images in every document (off: a tracking-pixel guard). */
  loadRemoteImages = $state(false);
  /** Documents whose remote images the reader loaded this session. */
  remoteImageDocs = $state<string[]>([]);
  /** Whether the open document may load remote images. */
  remoteImagesAllowed = $derived(
    this.loadRemoteImages || (!!this.currentPath && this.remoteImageDocs.includes(this.currentPath)),
  );
  /** A highlight the reading pane should scroll to once it is rendered. */
  focusHighlightId = $state<string | null>(null);
  #highlightsSaving: Promise<void> = Promise.resolve();
  commentThreads = $state<CommentThread[]>([]);
  commentFilter = $state<CommentFilter>("open");
  commentDraft = $state<CommentDraft | null>(null);
  activeThreadId = $state<string | null>(null);
  /** Flat-text position of each open thread's anchor in the preview. */
  threadOrder = $state<Record<string, number>>({});
  /** Source position of each open thread's anchor in the editor. */
  editorThreadPos: Record<string, { from: number; to: number }> = {};

  openCommentCount = $derived(this.commentThreads.filter((t) => !t.resolved).length);

  #preFocus: { viewMode: ViewMode; sidebar: boolean; toc: boolean; highlights: boolean } | null =
    null;

  /** Set by the Editor component while mounted; used for TOC + search. */
  editorView: EditorView | null = null;
  searchBackends: { editor?: SearchBackend; preview?: SearchBackend } = {};

  dirty = $derived(this.currentPath !== null && this.content !== this.savedContent);
  docName = $derived(this.currentPath?.split("/").pop() ?? "");
  /** .mmd files are standalone mermaid diagrams. */
  isMermaidDoc = $derived(this.docName.toLowerCase().endsWith(".mmd"));
  /** The active tab plays a video from the library instead of showing a document. */
  isVideoTab = $derived(this.currentPath !== null && isVideoPath(this.currentPath));
  toc = $derived<TocEntry[]>(
    this.currentPath && !this.isMermaidDoc ? extractToc(this.content) : [],
  );
  wordCount = $derived(
    this.currentPath && !this.isMermaidDoc ? (this.content.match(/\S+/g)?.length ?? 0) : 0,
  );
  readingMinutes = $derived(Math.max(1, Math.round(this.wordCount / 220)));
  /** Flat list of every document, for the quick-open switcher. */
  flatDocs = $derived.by(() => {
    const out: { name: string; path: string; rel: string }[] = [];
    const prefix = this.activeRoot.length + 1;
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.hidden) continue;
        if (n.isDir) walk(n.children);
        else if (!isImagePath(n.path) && !isVideoPath(n.path))
          out.push({ name: n.name, path: n.path, rel: n.path.slice(prefix) });
      }
    };
    walk(this.tree);
    return out;
  });
  /** Images in the previewed image's folder, in tree order (for ← / →). */
  imageSiblings = $derived.by(() => {
    const target = this.imagePath;
    if (!target) return [];
    const dir = target.slice(0, target.lastIndexOf("/"));
    const find = (nodes: TreeNode[]): TreeNode[] | null => {
      for (const n of nodes) {
        if (!n.isDir) continue;
        if (n.path === dir) return n.children;
        if (dir.startsWith(n.path + "/")) return find(n.children);
      }
      return null;
    };
    const nodes = dir === this.activeRoot ? this.tree : (find(this.tree) ?? []);
    return nodes.filter((n) => !n.isDir && isImagePath(n.path)).map((n) => n.path);
  });

  #autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  async init() {
    try {
      const v = JSON.parse(localStorage.getItem("inky.videoPositions") ?? "{}");
      if (v && typeof v === "object" && !Array.isArray(v)) this.#videoPositions = v;
    } catch {
      // damaged: every video starts from the beginning
    }
    const storedTheme = localStorage.getItem("inky.theme");
    if (storedTheme) this.themeId = storedTheme;
    try {
      const r = JSON.parse(localStorage.getItem("inky.recentThemes") ?? "[]");
      if (Array.isArray(r)) this.recentThemeIds = r.filter((x) => typeof x === "string");
    } catch {
      // a damaged list just starts empty
    }
    const storedView = localStorage.getItem("inky.viewMode") as ViewMode | null;
    if (storedView) this.viewMode = storedView;
    const storedScale = parseFloat(localStorage.getItem("inky.fontScale") ?? "");
    if (Number.isFinite(storedScale)) this.fontScale = clampScale(storedScale);
    const storedWidth = localStorage.getItem("inky.readingWidth") as ReadingWidth | null;
    if (storedWidth && storedWidth in READING_WIDTHS) this.readingWidth = storedWidth;
    this.typography = loadTypography(this.themeId);
    saveTypography(this.typography); // settles a legacy "theme" typeface for good
    this.tocVisible = localStorage.getItem("inky.tocVisible") === "true";
    this.syncScroll = localStorage.getItem("inky.syncScroll") !== "false";
    this.sidebarVisible = localStorage.getItem("inky.sidebar") !== "false";
    this.showHidden = localStorage.getItem("inky.showHidden") === "true";
    for (const dir of parsePathList(localStorage.getItem("inky.expandedDirs"))) {
      this.expandedDirs.add(dir);
    }
    this.loadRemoteImages = localStorage.getItem("inky.remoteImages") === "true";
    const storedColor = localStorage.getItem("inky.highlightColor");
    if (isColor(storedColor)) this.highlightColor = storedColor;
    this.highlightStore = parseStore(await invoke<string>("read_highlights").catch(() => ""));
    await this.loadThemes();
    this.applyTheme();
    this.pushThemeMenu();
    this.applyReadingPrefs();

    this.libraryRoot = await invoke<string>("library_root");
    this.homeDir = await homeDir().catch(() => "");
    this.workspace = await invoke<string | null>("workspace_root").catch(() => null);
    await this.refreshTree();

    // Listen before draining so nothing falls between the two. Requests wait
    // until last session's tabs are back, then open after them, in order.
    const queued: OpenRequest[] = [];
    let restoring = true;
    await listen<OpenRequest>("open-request", (e) => {
      if (restoring) queued.push(e.payload);
      else this.handleOpenRequest(e.payload).catch((err) => toast.error(String(err)));
    });
    queued.unshift(...(await invoke<OpenRequest[]>("take_pending_opens").catch(() => [])));
    let welcome: string | null = null;
    if (this.tree.length === 0 && !this.workspace) {
      welcome = await invoke<string>("create_doc", {
        dir: this.libraryRoot,
        name: "Welcome to Inky",
        ext: "md",
        content: WELCOME_DOC,
      });
      await this.refreshTree();
    }
    await this.#restoreTabs();
    const requested = queued.length > 0;
    for (let req = queued.shift(); req; req = queued.shift()) {
      try {
        await this.handleOpenRequest(req);
      } catch (err) {
        toast.error(String(err));
      }
    }
    restoring = false;
    if (!requested && welcome) await this.openInTab(welcome);

    listen<PathChange>("path-change", (e) => {
      const c = e.payload;
      if (c.kind === "moved") {
        this.#pathMoved(c.from, c.to);
      } else {
        this.#agentDeleted(c.path);
      }
    });

    // Pick up documents created outside the app (e.g. via the MCP server).
    window.addEventListener("focus", async () => {
      const t0 = performance.now();
      try {
        await this.syncFromDisk();
      } finally {
        displayLog(`sync after focus ${Math.round(performance.now() - t0)} ms`);
      }
    });
    // The Rust side watches the library folder; agent edits show up live.
    listen<WatchChange[]>("library-changed", (e) =>
      this.syncFromDisk({ tree: changesTree(e.payload, this.tree) }),
    );
    // Never let a debounced autosave die with the focus.
    window.addEventListener("blur", () => {
      if (this.dirty && !this.conflict) this.save();
    });
    // Red-button close: save first; the window closes once nothing is left.
    getCurrentWindow().onCloseRequested(async (event) => {
      if (!(await this.#leave({ quitting: true }))) event.preventDefault();
    });

    this.syncMenuChecks();
    // Silent startup update check (no-op until an update endpoint is live).
    this.checkForUpdates(false);
    if (localStorage.getItem("inky.mcpAutostart") === "true") {
      this.startMcpServer(false);
    }
    // Keep the MCP status light honest even if the process dies externally.
    setInterval(async () => {
      if (this.mcpUrl && !(await invoke<boolean>("mcp_status").catch(() => false))) {
        this.mcpUrl = null;
        toast.error("MCP server stopped unexpectedly");
      }
    }, 10_000);
  }

  /**
   * Bring back last session's tabs and load the active one; a tab that won't
   * load is dropped silently. Every tab is re-granted first (outside
   * documents need it) so the first `set_open_tabs` keeps them all listed.
   * Grants come only from Rust's own lists, never from localStorage.
   */
  async #restoreTabs() {
    const raw = localStorage.getItem("inky.tabs");
    const stored = parseTabs(raw, localStorage.getItem("inky.lastDoc"));
    // Migrating `inky.lastDoc`: Rust has no tab list yet, but it was a
    // recent, and it keeps the view the reader had.
    const migrating = raw === null;
    const grant = migrating ? "open_recent" : "restore_tab";
    const set = emptyTabs();
    const ids: string[] = [];
    for (const { path, view } of stored.tabs) {
      const granted = await invoke<string>(grant, { path }).catch(() => path);
      ids.push(addTab(set, granted, migrating ? this.#defaultView() : view).tab.id);
    }
    set.active = ids[stored.active] ?? null;
    this.tabSet = set;
    if (this.tabSet.active) await this.#showActive({ quiet: true });
    this.#persistTabs();
  }

  /** ⌘Q — save, then exit. */
  async quitApp() {
    if (await this.#leave({ quitting: true })) await invoke("quit_app");
  }

  async startMcpServer(announce: boolean) {
    try {
      const url = await invoke<string>("start_mcp", { port: 26317 });
      this.mcpUrl = url;
      localStorage.setItem("inky.mcpAutostart", "true");
      if (announce) {
        toast.success(`MCP server running at ${url}`, {
          duration: 12000,
          action: { label: "Connect an agent…", onClick: () => (this.mcpSetupOpen = true) },
        });
      }
    } catch (e) {
      this.mcpUrl = null;
      toast.error(`Could not start MCP server: ${e}`);
    }
  }

  openMcpSetup() {
    this.mcpSetupOpen = true;
  }

  async toggleMcpServer() {
    if (this.mcpUrl) {
      await invoke("stop_mcp");
      this.mcpUrl = null;
      localStorage.setItem("inky.mcpAutostart", "false");
      toast.success("MCP server stopped");
    } else {
      await this.startMcpServer(true);
    }
  }

  /** Push toggle/radio state into the native menu bar. */
  syncMenuChecks() {
    const checks: [string, boolean][] = [
      ["sync_scroll", this.syncScroll],
      ["focus_mode", this.focusMode],
      ...Object.keys(READING_WIDTHS).map(
        (k): [string, boolean] => [`width_${k}`, this.readingWidth === k],
      ),
    ];
    for (const [id, checked] of checks) {
      invoke("set_menu_checked", { id, checked }).catch(() => {});
    }
  }

  applyTheme() {
    applyThemeTo(document.documentElement, this.activeTheme);
    localStorage.setItem("inky.theme", this.themeId);
    this.themeVersion++;
  }

  setTheme(id: string) {
    this.themeId = id;
    const recent = pushRecent(this.recentThemeIds, id);
    if (recent.join() !== this.recentThemeIds.join()) {
      this.recentThemeIds = recent;
      localStorage.setItem("inky.recentThemes", JSON.stringify(recent));
    }
    this.applyTheme();
    this.syncMenuChecks();
    this.pushThemeMenu();
  }

  /** Rebuild the native Theme submenu from the theme list. */
  pushThemeMenu() {
    const entries = this.themes.map((t) => ({
      id: t.id,
      name: t.name,
      group: themeGroup(t.id),
      checked: t.id === this.themeId,
    }));
    invoke("set_theme_menu", { entries }).catch(() => {});
  }

  /** Replace the theme list (ordered) and tell the native menu. */
  #setThemes(list: Theme[]) {
    this.themes = orderThemes(list);
    this.pushThemeMenu();
  }

  /** Read the saved themes and Custom; fall back to Light if the active theme is gone. */
  async loadThemes() {
    let files: { id: string; json: string }[] = [];
    let listed = true;
    try {
      files = await invoke<{ id: string; json: string }[]>("list_themes");
    } catch (e) {
      listed = false;
      console.warn(`Could not read saved themes: ${e}`);
    }
    const loaded = loadThemeFiles(files);
    for (const w of loaded.warnings) console.warn(w);
    this.customBasedOn = loaded.customBasedOn;
    const list: Theme[] = [...BUILT_IN, ...loaded.yours];
    if (loaded.custom) list.push(loaded.custom);
    this.#setThemes(list);
    const { missing } = activeOrFallback(this.themes, this.themeId);
    if (missing && listed) {
      toast.info(`Theme "${this.themeId}" is no longer available. Using Light.`);
      this.themeId = "light";
    }
    // When the list could not be read, the stored id stays: `activeTheme` shows
    // Light for this session without forgetting the choice.
  }

  /**
   * Show an edit state as the active Custom theme. Runs on every picker frame,
   * so it only paints: the colours go on <html> and Custom into the list. The
   * menus, stored id, theme-keyed re-renders and custom.json follow once the
   * edits pause (`#settleCustom`).
   */
  applyEdit(s: EditState) {
    const theme = editedTheme(s);
    if (s.start.id !== "custom") this.customBasedOn = s.start.id;
    this.themes = withCustom(this.themes, theme);
    this.themeId = "custom";
    applyThemeTo(document.documentElement, theme);
    if (this.#customTimer) clearTimeout(this.#customTimer);
    this.#customTimer = setTimeout(() => this.#settleCustom(), 300);
  }

  /** Settle pending Custom edits now (editor closing, app quitting). */
  flushCustom() {
    if (!this.#customTimer) return;
    clearTimeout(this.#customTimer);
    this.#settleCustom();
  }

  /** Catch up after live edits: stored id, theme-keyed re-renders, menus, custom.json. */
  #settleCustom() {
    this.#customTimer = null;
    this.applyTheme();
    this.syncMenuChecks();
    this.pushThemeMenu();
    this.#writeCustom();
  }

  #writeCustom() {
    // Writing now makes a pending settle's write redundant.
    if (this.#customTimer) clearTimeout(this.#customTimer);
    this.#customTimer = null;
    const custom = this.themes.find((t) => t.id === "custom");
    if (!custom) return;
    const json = customFile(custom, this.customBasedOn ?? "light");
    invoke("write_theme", { id: "custom", json }).catch((e) => toast.error(`Could not save Custom: ${e}`));
  }

  async #writeTheme(t: Theme): Promise<boolean> {
    try {
      await invoke("write_theme", { id: t.id, json: serializeTheme(t) });
      return true;
    } catch (e) {
      toast.error(`Could not save theme: ${e}`);
      return false;
    }
  }

  #putTheme(t: Theme) {
    this.#setThemes([...this.themes.filter((x) => x.id !== t.id), t]);
  }

  /** Overwrite the saved theme Custom was based on with Custom's colours. */
  async saveTheme() {
    const custom = this.themes.find((t) => t.id === "custom");
    const base = this.themes.find((t) => t.id === this.customBasedOn);
    if (!custom || !base || themeGroup(base.id) !== "yours") return;
    const saved: Theme = { ...custom, id: base.id, name: base.name };
    if (!(await this.#writeTheme(saved))) return;
    this.#putTheme(saved);
    this.setTheme(saved.id);
  }

  /** Save the shown theme as a new theme of yours; it becomes active. */
  async saveThemeAs(name: string) {
    const source = this.activeTheme;
    const id = slugFor(name, new Set(this.themes.map((t) => t.id)));
    const saved: Theme = {
      ...source,
      id,
      name: uniqueName(name, this.themes.map((t) => t.name).concat("Custom")),
    };
    if (!(await this.#writeTheme(saved))) return;
    this.#putTheme(saved);
    if (source.id === "custom") {
      this.customBasedOn = id;
      this.#writeCustom();
    }
    this.setTheme(id);
  }

  /** Overwrite the theme of yours `id` with the shown colours (keeping its id and name); it becomes active. */
  async replaceTheme(id: string) {
    const target = this.themes.find((t) => t.id === id);
    if (!target || themeGroup(id) !== "yours") return;
    const source = this.activeTheme;
    const saved: Theme = { ...source, id, name: target.name };
    if (!(await this.#writeTheme(saved))) return;
    this.#putTheme(saved);
    if (source.id === "custom") {
      this.customBasedOn = id;
      this.#writeCustom();
    }
    this.setTheme(id);
  }

  async renameTheme(id: string, name: string) {
    const t = this.themes.find((x) => x.id === id);
    if (!t || themeGroup(id) !== "yours") return;
    const others = this.themes.filter((x) => x.id !== id && x.id !== "custom");
    const renamed: Theme = { ...t, name: uniqueName(name, others.map((x) => x.name).concat("Custom")) };
    if (!(await this.#writeTheme(renamed))) return;
    this.#putTheme(renamed);
  }

  async duplicateTheme(id: string) {
    const t = this.themes.find((x) => x.id === id);
    if (!t) return;
    const copy: Theme = {
      ...t,
      id: slugFor(`${t.name} copy`, new Set(this.themes.map((x) => x.id))),
      name: uniqueName(`${t.name} copy`, this.themes.map((x) => x.name)),
    };
    if (!(await this.#writeTheme(copy))) return;
    this.#putTheme(copy);
  }

  async deleteTheme(id: string) {
    if (themeGroup(id) !== "yours") return;
    try {
      await invoke("delete_theme", { id });
    } catch (e) {
      toast.error(`Could not delete theme: ${e}`);
      return;
    }
    this.#setThemes(this.themes.filter((t) => t.id !== id));
    if (this.themeId === id) this.setTheme("light");
  }

  async importTheme() {
    let json: string | null;
    try {
      json = await invoke<string | null>("import_theme_file");
    } catch (e) {
      toast.error(`Could not import theme: ${e}`);
      return;
    }
    if (json === null) return;
    const r = parseTheme(json);
    if (!r.ok) {
      toast.error(`Could not import theme: ${r.error}`);
      return;
    }
    const imported: Theme = {
      ...r.theme,
      id: slugFor(r.theme.name, new Set(this.themes.map((t) => t.id))),
      name: uniqueName(r.theme.name, this.themes.map((t) => t.name)),
    };
    if (!(await this.#writeTheme(imported))) return;
    this.#putTheme(imported);
    this.setTheme(imported.id);
    if (r.warnings.length) toast.warning(`Imported with warnings: ${r.warnings.join("; ")}`);
  }

  async exportTheme(t: Theme) {
    try {
      const saved = await invoke<boolean>("export_theme_file", { name: t.name, json: serializeTheme(t) });
      if (saved) toast.success(`Exported ${t.name}`);
    } catch (e) {
      toast.error(`Could not export theme: ${e}`);
    }
  }

  openThemeEditor() {
    this.themeEditorVisible = true;
  }

  setViewMode(mode: ViewMode) {
    this.viewMode = mode;
    localStorage.setItem("inky.viewMode", mode);
    if (this.focusMode && mode !== "editor") {
      this.focusMode = false;
      this.#preFocus = null;
      this.syncMenuChecks();
    }
    // Focus mode only borrows the view; the tab keeps its own.
    const tab = activeTab(this.tabSet);
    if (tab && !this.focusMode) {
      tab.view = mode;
      this.#persistTabs();
    }
  }

  applyReadingPrefs() {
    const root = document.documentElement;
    root.style.setProperty("--prose-scale", String(this.fontScale));
    root.style.setProperty("--prose-width", READING_WIDTHS[this.readingWidth].value);
    for (const [prop, value] of Object.entries(typographyVars(this.typography))) {
      if (value === null) root.style.removeProperty(prop);
      else root.style.setProperty(prop, value);
    }
    root.classList.toggle("justify-text", this.typography.justify);
  }

  /** Run a layout-changing update without losing the reader's place. */
  #keepReadingPosition(update: () => void) {
    const el = this.previewScroller;
    const box = el?.querySelector<HTMLElement>(".prose-doc");
    const pos = el && box ? capturePosition(box, el) : null;
    update();
    if (el && box && pos) {
      lockSync(100);
      el.scrollTop = targetScrollTop(box, el, pos);
    }
  }

  setTypography(patch: Partial<Typography>) {
    this.#keepReadingPosition(() => {
      this.typography = { ...this.typography, ...patch };
      saveTypography(this.typography);
      this.applyReadingPrefs();
    });
  }

  adjustFontScale(step: -1 | 1) {
    this.setFontScale(stepScale(this.fontScale, step));
  }

  /** Change text size, keeping the reading position in the preview. */
  setFontScale(scale: number) {
    const next = clampScale(scale);
    if (next === this.fontScale) return;
    this.#keepReadingPosition(() => {
      this.fontScale = next;
      localStorage.setItem("inky.fontScale", String(next));
      this.applyReadingPrefs();
    });
  }

  /** Load the open document's remote images (this session only). */
  allowRemoteImagesHere() {
    const path = this.currentPath;
    if (path && !this.remoteImageDocs.includes(path)) this.remoteImageDocs = [...this.remoteImageDocs, path];
  }

  setLoadRemoteImages(on: boolean) {
    this.loadRemoteImages = on;
    localStorage.setItem("inky.remoteImages", String(on));
    if (!on) this.remoteImageDocs = [];
  }

  setReadingWidth(width: ReadingWidth) {
    this.#keepReadingPosition(() => {
      this.readingWidth = width;
      localStorage.setItem("inky.readingWidth", width);
      this.applyReadingPrefs();
    });
    this.syncMenuChecks();
  }

  toggleToc() {
    this.tocVisible = !this.tocVisible;
    if (this.tocVisible) {
      this.commentsVisible = false;
      this.highlightsVisible = false;
      this.themesPanelVisible = false;
    }
    localStorage.setItem("inky.tocVisible", String(this.tocVisible));
  }

  toggleComments() {
    if (!this.docSidecars && !this.commentsVisible) return;
    this.commentsVisible = !this.commentsVisible;
    if (this.commentsVisible) {
      this.tocVisible = false;
      this.highlightsVisible = false;
      this.themesPanelVisible = false;
    } else this.commentDraft = null;
  }

  // --- comments ------------------------------------------------------------

  async loadComments() {
    this.commentThreads = [];
    this.activeThreadId = null;
    this.commentDraft = null;
    this.threadOrder = {};
    this.editorThreadPos = {};
    if (!this.currentPath) return;
    if (!this.docSidecars) return;
    try {
      const raw = await invoke<string>("read_comments", { docPath: this.currentPath });
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.threads)) this.commentThreads = parsed.threads;
      }
    } catch {
      // Missing or unreadable sidecar: start empty.
    }
  }

  async saveComments() {
    if (!this.currentPath) return;
    const json = this.commentThreads.length
      ? JSON.stringify({ version: 1, threads: this.commentThreads }, null, 2)
      : "";
    try {
      await invoke("write_comments", { docPath: this.currentPath, json });
    } catch (e) {
      toast.error(`Could not save comments: ${e}`);
    }
  }

  startCommentDraft(draft: CommentDraft) {
    this.commentDraft = draft;
    this.commentsVisible = true;
    this.tocVisible = false;
    this.highlightsVisible = false;
    this.themesPanelVisible = false;
    this.activeThreadId = null;
  }

  addThread(text: string) {
    if (!this.commentDraft || !text.trim()) return;
    const now = new Date().toISOString();
    const thread: CommentThread = {
      id: newId("thread"),
      quote: this.commentDraft.quote,
      prefix: this.commentDraft.prefix,
      suffix: this.commentDraft.suffix,
      resolved: false,
      createdAt: now,
      comments: [{ id: newId("msg"), text: text.trim(), createdAt: now }],
    };
    this.commentThreads = [...this.commentThreads, thread];
    this.commentDraft = null;
    this.activeThreadId = thread.id;
    this.commentFilter = this.commentFilter === "resolved" ? "open" : this.commentFilter;
    this.saveComments();
  }

  replyToThread(threadId: string, text: string) {
    if (!text.trim()) return;
    this.commentThreads = this.commentThreads.map((t) =>
      t.id === threadId
        ? {
            ...t,
            comments: [
              ...t.comments,
              { id: newId("msg"), text: text.trim(), createdAt: new Date().toISOString() },
            ],
          }
        : t,
    );
    this.saveComments();
  }

  setThreadResolved(threadId: string, resolved: boolean) {
    this.commentThreads = this.commentThreads.map((t) =>
      t.id === threadId ? { ...t, resolved } : t,
    );
    if (this.activeThreadId === threadId && resolved) this.activeThreadId = null;
    this.saveComments();
  }

  deleteThread(threadId: string) {
    this.commentThreads = this.commentThreads.filter((t) => t.id !== threadId);
    if (this.activeThreadId === threadId) this.activeThreadId = null;
    this.saveComments();
  }

  /** Focus a thread from a highlight click (opens the panel). */
  openThread(threadId: string) {
    this.activeThreadId = threadId;
    this.commentsVisible = true;
    this.tocVisible = false;
    this.highlightsVisible = false;
    this.themesPanelVisible = false;
    const thread = this.commentThreads.find((t) => t.id === threadId);
    if (thread?.resolved && this.commentFilter === "open") this.commentFilter = "all";
  }

  /** Scroll the document to a thread's anchor (from a panel card click). */
  revealThread(threadId: string) {
    this.activeThreadId = threadId;
    const mark = document.querySelector<HTMLElement>(
      `mark.comment-hl[data-thread-id="${CSS.escape(threadId)}"]`,
    );
    if (mark && this.viewMode !== "editor") {
      lockSync(700);
      mark.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const pos = this.editorThreadPos[threadId];
    if (this.viewMode !== "preview" && this.editorView && pos) {
      lockSync(700);
      this.editorView.dispatch({
        selection: { anchor: pos.from },
        effects: EditorView.scrollIntoView(pos.from, { y: "center" }),
      });
    }
  }

  toggleSyncScroll() {
    this.syncScroll = !this.syncScroll;
    localStorage.setItem("inky.syncScroll", String(this.syncScroll));
    this.syncMenuChecks();
  }

  openSearch() {
    if (this.currentPath) this.searchOpen = true;
  }

  toggleHighlights() {
    this.highlightsVisible = !this.highlightsVisible;
    if (this.highlightsVisible) {
      this.tocVisible = false;
      this.commentsVisible = false;
      this.themesPanelVisible = false;
    }
  }

  toggleThemesPanel() {
    this.themesPanelVisible = !this.themesPanelVisible;
    if (this.themesPanelVisible) {
      this.tocVisible = false;
      this.commentsVisible = false;
      this.highlightsVisible = false;
    }
  }

  // --- highlights (see $lib/highlights) ---------------------------------------

  #saveHighlights() {
    const json = JSON.stringify($state.snapshot(this.highlightStore));
    // Chained, so saves land in order even when made in quick succession.
    this.#highlightsSaving = this.#highlightsSaving.then(() =>
      invoke("write_highlights", { json }).then(
        () => {},
        (e) => {
          toast.error(`Could not save highlights: ${e}`);
        },
      ),
    );
  }

  /**
   * Highlight `anchor`. `replaces`: highlights it overlaps, which merge into
   * it (their notes are kept), so text is never highlighted twice. Covering
   * exactly one existing highlight just recolours it.
   */
  addHighlight(
    anchor: TextAnchor & { text?: string },
    color: HighlightColor = this.highlightColor,
    replaces: string[] = [],
  ): string | null {
    const path = this.currentPath;
    if (!path || this.isMermaidDoc || !anchor.quote.trim()) return null;
    const list = this.highlightStore[path] ?? [];
    const merged = list.filter((x) => replaces.includes(x.id));
    if (merged.length === 1 && merged[0].quote === anchor.quote) {
      this.updateHighlight(merged[0].id, { color });
      return merged[0].id;
    }
    const notes = [...new Set(merged.map((x) => x.note.trim()).filter(Boolean))];
    const h: Highlight = {
      id: newId("hl"),
      quote: anchor.quote,
      prefix: anchor.prefix,
      suffix: anchor.suffix,
      color,
      note: notes.join("\n\n"),
      createdAt: new Date().toISOString(),
    };
    if (anchor.text && anchor.text !== anchor.quote) h.text = anchor.text;
    this.highlightStore[path] = [...list.filter((x) => !replaces.includes(x.id)), h];
    this.highlightColor = color;
    localStorage.setItem("inky.highlightColor", color);
    this.#saveHighlights();
    return h.id;
  }

  updateHighlight(id: string, patch: Partial<Pick<Highlight, "color" | "note">>) {
    for (const list of Object.values(this.highlightStore)) {
      const h = list.find((x) => x.id === id);
      if (!h) continue;
      Object.assign(h, patch);
      if (patch.color) {
        this.highlightColor = patch.color;
        localStorage.setItem("inky.highlightColor", patch.color);
      }
      this.#saveHighlights();
      return;
    }
  }

  removeHighlight(id: string) {
    this.removeHighlights([id]);
  }

  /** Remove highlights (from any documents), with one Undo for all of them. */
  removeHighlights(ids: string[]) {
    const removed: [string, Highlight][] = [];
    for (const [path, list] of Object.entries(this.highlightStore)) {
      const gone = list.filter((x) => ids.includes(x.id));
      if (!gone.length) continue;
      for (const h of gone) removed.push([path, $state.snapshot(h) as Highlight]);
      const rest = list.filter((x) => !ids.includes(x.id));
      if (rest.length) this.highlightStore[path] = rest;
      else delete this.highlightStore[path];
    }
    if (!removed.length) return;
    this.#saveHighlights();
    toast.success(removed.length === 1 ? "Highlight removed" : `${removed.length} highlights removed`, {
      action: {
        label: "Undo",
        onClick: () => {
          for (const [path, h] of removed) {
            this.highlightStore[path] = [...(this.highlightStore[path] ?? []), h];
          }
          this.#saveHighlights();
        },
      },
    });
  }

  /** Show a highlight: open its document if needed, then scroll to it. */
  async revealHighlight(path: string, id: string) {
    if (path !== this.currentPath && !(await this.openInTab(path))) return;
    if (this.viewMode === "editor") this.setViewMode("preview");
    this.focusHighlightId = id;
  }

  toggleSidebar() {
    this.sidebarVisible = !this.sidebarVisible;
    localStorage.setItem("inky.sidebar", String(this.sidebarVisible));
  }

  toggleFocusMode() {
    if (!this.focusMode) {
      this.#preFocus = {
        viewMode: this.viewMode,
        sidebar: this.sidebarVisible,
        toc: this.tocVisible,
        highlights: this.highlightsVisible,
      };
      this.focusMode = true;
      this.viewMode = "editor";
      this.sidebarVisible = false;
      this.tocVisible = false;
      this.highlightsVisible = false;
      this.themesPanelVisible = false;
    } else {
      this.focusMode = false;
      if (this.#preFocus) {
        // The tab may have changed while in focus mode; each keeps its view.
        this.viewMode = activeTab(this.tabSet)?.view ?? this.#preFocus.viewMode;
        this.sidebarVisible = this.#preFocus.sidebar;
        this.tocVisible = this.#preFocus.toc;
        this.highlightsVisible = this.#preFocus.highlights;
        this.#preFocus = null;
      }
    }
    this.syncMenuChecks();
  }

  async checkForUpdates(manual: boolean) {
    try {
      const update = await check();
      if (update) {
        toast.info(`Inky ${update.version} is available`, {
          duration: 20000,
          action: {
            label: "Install & Relaunch",
            onClick: async () => {
              try {
                await update.downloadAndInstall();
                await relaunch();
              } catch (e) {
                toast.error(`Update failed: ${e}`);
              }
            },
          },
        });
      } else if (manual) {
        toast.success("You're on the latest version");
      }
    } catch (e) {
      if (manual) toast.error(`Could not check for updates: ${e}`);
    }
  }

  scrollToHeading(entry: TocEntry) {
    this.activeHeadingId = entry.id;
    // Both panes are positioned explicitly here; don't let scroll-sync echo.
    lockSync(700);
    if (this.viewMode !== "editor") {
      document.getElementById(entry.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (this.viewMode !== "preview" && this.editorView) {
      const view = this.editorView;
      const line = Math.min(entry.line, view.state.doc.lines);
      const pos = view.state.doc.line(line).from;
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: 16 }),
      });
    }
  }

  async movePath(path: string, targetDir: string) {
    try {
      const newPath = await invoke<string>("move_path", { path, targetDir });
      await this.#pathMoved(path, newPath);
    } catch (e) {
      toast.error(`Move failed: ${e}`);
    }
  }

  /** A file or folder was renamed or moved (in the app or by an agent). */
  async #pathMoved(from: string, to: string) {
    if (from === to) return;
    renamePath(this.nav, from, to);
    this.#remapExpanded(from, to);
    if (this.imagePath) this.imagePath = remapPath(this.imagePath, from, to);
    remapPositions(from, to);
    if (remapStore(this.highlightStore, from, to)) this.#saveHighlights();
    invoke("move_baseline", { from, to }).catch(() => {});
    if (this.currentPath && isInside(this.currentPath, from)) {
      this.currentPath = remapPath(this.currentPath, from, to);
      this.#showTitle();
    }
    if (remapTabs(this.tabSet, from, to)) this.#persistTabs();
    await this.refreshTree();
  }

  /**
   * A file or folder was deleted (in the app or by an agent): close its tabs
   * and show the next one. Highlights are the caller's call (Undo).
   */
  async #pathDeleted(path: string, { keepEdits = false } = {}): Promise<Tab | null> {
    const loaded = this.currentPath !== null && isInside(this.currentPath, path);
    const active = activeTab(this.tabSet);
    const keep =
      keepEdits && loaded && this.dirty && active?.path === this.currentPath ? active : null;
    forgetPath(this.nav, path);
    forgetPositions(path);
    if (loaded && !keep) this.closeDoc();
    const count = this.tabSet.tabs.length;
    const { activeClosed } = dropTabs(this.tabSet, path, keep?.id);
    if (this.tabSet.tabs.length !== count) this.#persistTabs();
    await this.refreshTree();
    if (activeClosed) await this.#showActive();
    return keep;
  }

  /**
   * An agent deleted a file or folder. Unsaved edits in the open document
   * stay open (as when a file vanishes from disk): saving brings it back.
   * There is no Undo, so other highlights go now.
   */
  async #agentDeleted(path: string) {
    const kept = await this.#pathDeleted(path, { keepEdits: true });
    const mine = kept ? this.highlightStore[kept.path] : undefined;
    if (forgetInStore(this.highlightStore, path)) {
      if (kept && mine) this.highlightStore[kept.path] = mine;
      this.#saveHighlights();
    }
    if (kept) {
      toast.warning(
        `${kept.path.split("/").pop()} was deleted by an agent. Your unsaved edits are still open; saving restores the file.`,
      );
    }
  }

  /** The tree as last read, to skip rebuilding the sidebar when nothing moved. */
  #treeJson = "";

  async refreshTree() {
    try {
      const tree = await invoke<TreeNode[]>("list_tree", { showHidden: this.showHidden });
      const json = JSON.stringify(tree);
      if (json !== this.#treeJson) {
        this.#treeJson = json;
        this.tree = tree;
      }
      // An image deleted or moved away (in the app or on disk) leaves the preview.
      if (this.imagePath && !this.imageSiblings.includes(this.imagePath)) this.imagePath = null;
    } catch (e) {
      toast.error(`Could not read library: ${e}`);
    }
  }

  setExpanded(dir: string, open: boolean) {
    if (open === this.expandedDirs.has(dir)) return;
    if (open) this.expandedDirs.add(dir);
    else this.expandedDirs.delete(dir);
    this.#saveExpanded();
  }

  /** Keep a renamed or moved folder (and the folders inside it) expanded. */
  #remapExpanded(from: string, to: string) {
    const moved = [...this.expandedDirs].filter((dir) => isInside(dir, from));
    if (!moved.length) return;
    for (const dir of moved) this.expandedDirs.delete(dir);
    for (const dir of moved) this.expandedDirs.add(remapPath(dir, from, to));
    this.#saveExpanded();
  }

  #saveExpanded() {
    localStorage.setItem("inky.expandedDirs", JSON.stringify([...this.expandedDirs]));
  }

  toggleShowHidden() {
    this.showHidden = !this.showHidden;
    localStorage.setItem("inky.showHidden", String(this.showHidden));
    this.refreshTree();
  }

  /** Hide a file or folder from Inky via `.inkyignore` (undoable). */
  async hidePath(path: string) {
    const name = path.split("/").pop() ?? path;
    try {
      await invoke("hide_path", { path });
      await this.refreshTree();
      toast.success(`Hid ${name}`, {
        description: this.showHidden
          ? "Shown dimmed while hidden items are visible."
          : "Show it again with the eye button in the sidebar.",
        action: { label: "Undo", onClick: () => this.unhidePath(path) },
      });
    } catch (e) {
      toast.error(`Could not hide ${name}: ${e}`);
    }
  }

  async unhidePath(path: string) {
    try {
      await invoke("unhide_path", { path });
    } catch (e) {
      // Hidden by a pattern the user wrote; say which, and where.
      toast.error(String(e), {
        action: {
          label: "Show rules file",
          onClick: async () => {
            const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
            revealItemInDir(`${this.activeRoot}/.inkyignore`).catch(() => {});
          },
        },
      });
    }
    await this.refreshTree();
  }

  /** Asset URL for a local image, versioned once the file changed on disk. */
  imageUrl(path: string): string {
    const version = this.imageVersions[path];
    const url = convertFileSrc(path);
    return version ? `${url}?v=${encodeURIComponent(version)}` : url;
  }

  /**
   * Check the files behind shown images (default: every image shown this
   * session). The first check of an image records its baseline; a later
   * change bumps its version, and every place showing it reloads it.
   */
  async checkImages(paths: string[] = [...this.#imageStamps.keys()]) {
    if (!paths.length) return;
    try {
      const stamps = await invoke<Record<string, string>>("image_stamps", { paths });
      applyStamps(this.#imageStamps, this.imageVersions, stamps);
    } catch {
      // Stamps are a convenience: images still show, just possibly cached.
    }
  }

  #syncing: Promise<void> | null = null;
  #syncAgain = false;
  #syncTree = false;

  /**
   * Catch up with changes made on disk (agents, other editors). Calls made
   * while one runs are folded into a single follow-up run, so a stream of
   * agent writes never stacks up refreshes. `tree: false` when the sidebar
   * cannot have changed (only listed documents were edited).
   */
  syncFromDisk({ tree = true }: { tree?: boolean } = {}): Promise<void> {
    if (tree) this.#syncTree = true;
    if (this.#syncing) {
      this.#syncAgain = true;
      return this.#syncing;
    }
    this.#syncing = (async () => {
      try {
        do {
          this.#syncAgain = false;
          const withTree = this.#syncTree;
          this.#syncTree = false;
          await this.#syncOnce(withTree);
        } while (this.#syncAgain);
      } finally {
        // Cleared in the same step as the last check, so no call slips between.
        this.#syncing = null;
      }
    })();
    return this.#syncing;
  }

  async #syncOnce(withTree: boolean) {
    if (withTree) await this.refreshTree();
    // Agents replace pictures without touching the document's text.
    this.checkImages();
    const path = this.currentPath;
    if (path && this.#editingInPlace) {
      // Swapping the text under an open in-place edit would misplace it.
      this.#diskCheckPending = true;
    } else if (path && !this.conflict && !this.isVideoTab) {
      try {
        const disk = await invoke<string>("read_doc", { path });
        if (disk !== this.savedContent) await this.#takeDiskChange(path, disk);
      } catch {
        // File disappeared from disk; keep the buffer so the user can re-save.
      }
    }
    // Pick up comment threads written by agents via the MCP server.
    await this.reloadCommentsFromDisk();
    // Reflect the hosted MCP server dying (e.g. node killed externally).
    if (this.mcpUrl && !(await invoke<boolean>("mcp_status").catch(() => false))) {
      this.mcpUrl = null;
    }
  }

  /** Refresh threads from the sidecar without touching draft/selection state. */
  async reloadCommentsFromDisk() {
    if (!this.currentPath || this.isVideoTab) return;
    try {
      const raw = await invoke<string>("read_comments", { docPath: this.currentPath });
      const threads: CommentThread[] = raw ? (JSON.parse(raw).threads ?? []) : [];
      if (JSON.stringify(threads) === JSON.stringify(this.commentThreads)) return;
      // Surface externally-added messages (e.g. an agent replying via MCP).
      const known = new Set(this.commentThreads.flatMap((t) => t.comments.map((m) => m.id)));
      const fresh = threads.flatMap((t) => t.comments).filter((m) => !known.has(m.id));
      this.commentThreads = threads;
      if (fresh.length > 0) {
        const authors = [...new Set(fresh.map((m) => m.author).filter(Boolean))];
        const who = authors.length ? ` from ${authors.join(", ")}` : "";
        toast.info(`${fresh.length} new comment${fresh.length === 1 ? "" : "s"}${who}`, {
          action: {
            label: "Show",
            onClick: () => {
              this.commentsVisible = true;
              this.tocVisible = false;
              this.highlightsVisible = false;
              this.themesPanelVisible = false;
            },
          },
        });
      }
    } catch {
      // Unreadable sidecar; keep current state.
    }
  }

  /** Where the reader is right now, for the back/forward stacks. */
  #here(): NavEntry | null {
    if (!this.currentPath) return null;
    const scroller =
      this.viewMode === "editor" ? this.editorView?.scrollDOM : this.previewScroller;
    return { path: this.currentPath, scroll: scroller?.scrollTop ?? 0 };
  }

  /**
   * Open a document in the active tab (the first tab, if none is open).
   * Unless `restoreScroll` is given (history navigation) or a tab is being
   * shown (`fromTab`), the document being left is pushed onto the back stack.
   */
  async openDoc(path: string, opts: OpenOptions = {}): Promise<boolean> {
    return (await this.#open(path, opts)) === "loaded";
  }

  /** Bumped by every load; a load that sees a newer one gives way to it. */
  #loadSeq = 0;

  async #open(path: string, opts: OpenOptions = {}): Promise<Load> {
    const seq = ++this.#loadSeq;
    const superseded = () => seq !== this.#loadSeq;
    // Loading replaces the buffer, even with the same document: never over
    // edits that are still unsaved.
    const left = await this.#leave();
    if (superseded()) return "superseded";
    if (!left) return "blocked";
    const leaving = this.#here();
    try {
      const video = isVideoPath(path);
      // A video tab has no text: it only needs the file to be there.
      const text = video
        ? await invoke<boolean>("path_exists", { path }).then((ok) => {
            if (!ok) throw new Error("the file is missing");
            return "";
          })
        : await invoke<string>("read_doc", { path });
      // A later load took over while this one read: it owns the tab now.
      if (superseded()) return "superseded";
      if (!opts.fromTab && opts.restoreScroll === undefined && leaving && leaving.path !== path) {
        recordVisit(this.nav, leaving);
      }
      // The Preview restores this once it has rendered; writing mode has no
      // Preview, so the editor is scrolled directly below.
      this.pendingScroll = this.viewMode === "editor" ? null : (opts.restoreScroll ?? null);
      this.announceResume = true;
      this.conflict = null;
      this.imagePath = null;
      this.mediaView = null;
      if (path !== this.currentPath) {
        this.changes = null;
        this.#baseline = null;
      }
      this.currentPath = path;
      this.docLoads++;
      this.content = text;
      this.savedContent = text;
      // The active tab shows it now; with no tab open, this is the first.
      if (!this.tabSet.active) addTab(this.tabSet, path, this.#preFocus?.viewMode ?? this.viewMode);
      const tab = activeTab(this.tabSet)!;
      tab.path = path;
      tab.nav = this.nav;
      this.#persistTabs();
      if (video) {
        this.changes = null;
        this.docSidecars = false;
        this.commentsVisible = false;
        this.historyVisible = false;
        await this.loadComments();
        this.#showTitle();
        return "loaded";
      }
      await this.#loadChanges(path, text);
      this.#showTitle();
      const sidecars = await invoke<boolean>("doc_sidecars", { path }).catch(() => false);
      // Another document was loaded meanwhile; the rest is its own.
      if (this.currentPath !== path) return "superseded";
      this.docSidecars = sidecars;
      if (!this.docSidecars) {
        this.commentsVisible = false;
        this.historyVisible = false;
      }
      await this.loadComments();
      invoke("note_recent", { path }).catch(() => {});
      if (opts.restoreScroll !== undefined && this.viewMode === "editor" && this.editorView) {
        const scrollDOM = this.editorView.scrollDOM;
        const top = opts.restoreScroll;
        requestAnimationFrame(() => (scrollDOM.scrollTop = top));
      }
      return "loaded";
    } catch (e) {
      if (superseded()) return "superseded";
      if (!opts.silent) toast.error(`Could not open document: ${e}`);
      return "failed";
    }
  }

  /**
   * Where a video starts once loaded: the moment a timestamp link asked for
   * (and then it plays), else where it was left.
   */
  videoStart(path: string, duration: number): { time: number; play: boolean } {
    const seek = this.#videoSeek;
    if (seek?.path === path) {
      this.#videoSeek = null;
      return { time: seek.time, play: true };
    }
    return { time: resumeAt(this.#videoPositions[path], duration), play: false };
  }

  rememberVideo(path: string, time: number, duration: number) {
    this.#videoPositions = rememberPosition(this.#videoPositions, path, time, duration);
    try {
      localStorage.setItem("inky.videoPositions", JSON.stringify(this.#videoPositions));
    } catch {
      // storage full or unavailable: the place is only kept for this session
    }
  }

  /** Open a video in its tab, starting at `time` seconds when given. */
  openVideo(path: string, time: number | null, background = false) {
    this.#videoSeek = time === null ? null : { path, time };
    return this.openInTab(path, { background });
  }

  /** Preview an image over the current document (the document stays open). */
  async openImage(path: string) {
    if (this.dirty) await this.save();
    this.mediaView = null;
    this.imagePath = path;
  }

  openMedia(items: MediaItem[], index: number) {
    this.imagePath = null;
    this.mediaView = { items, index };
  }

  closeMedia() {
    this.mediaView = null;
  }

  closeImage() {
    this.imagePath = null;
  }

  async goBack() {
    await this.#travel(goBack);
  }

  async goForward() {
    await this.#travel(goForward);
  }

  async #travel(step: typeof goBack) {
    if (!(step === goBack ? this.canGoBack : this.canGoForward)) return;
    // Leave first, so history only moves once the document can be left.
    if (!(await this.#leave())) return;
    const here = this.#here();
    const target = step(this.nav, here);
    if (!target) return;
    const restoreScroll = target.scroll;
    // Only a document that can't be opened falls through to a re-grant.
    const done = (r: Load) => r !== "failed";
    if (done(await this.#open(target.path, { restoreScroll, silent: true }))) return;
    // Outside documents of a closed workspace need re-granting (recents).
    const seq = this.#loadSeq;
    const regranted = await invoke<string>("open_recent", { path: target.path }).catch(() => null);
    if (seq !== this.#loadSeq) return;
    if (regranted && done(await this.#open(regranted, { restoreScroll, silent: true }))) return;
    // A target that can't be opened any more (deleted outside the app) is
    // dropped so the next press moves past it; we stay put, so un-record here.
    if (here) (step === goBack ? this.nav.forward : this.nav.back).pop();
    forgetPath(this.nav, target.path);
    toast.error(`Could not open ${target.path.split("/").pop()}`);
  }

  closeDoc() {
    this.conflict = null;
    this.currentPath = null;
    this.docLoads++;
    this.changes = null;
    this.#baseline = null;
    this.content = "";
    this.savedContent = "";
    this.commentThreads = [];
    this.commentDraft = null;
    this.activeThreadId = null;
    this.docSidecars = true;
    this.#showTitle();
  }

  /** The window title follows the loaded document. */
  #showTitle() {
    const stem = this.docName.replace(/\.(md|markdown|mmd)$/i, "");
    getCurrentWindow().setTitle(this.currentPath ? `${stem} — Inky` : "Inky");
  }

  // --- tabs (see $lib/tabs) ---------------------------------------------------

  /** View for a new tab: the one the reader last chose. */
  #defaultView(): ViewMode {
    return (localStorage.getItem("inky.viewMode") as ViewMode | null) ?? "split";
  }

  #persistTabs() {
    localStorage.setItem("inky.tabs", serializeTabs(this.tabSet));
    localStorage.removeItem("inky.lastDoc");
    // Rust's copy is what may re-grant the outside ones after a relaunch.
    invoke("set_open_tabs", { paths: this.tabSet.tabs.map((t) => t.path) }).catch(() => {});
  }

  /** Keep the active tab's place before it is left. */
  #stashActive() {
    const tab = activeTab(this.tabSet);
    if (!tab) return;
    if (tab.path === this.currentPath) tab.scroll = this.#here()?.scroll ?? null;
    tab.nav = this.nav;
    if (!this.focusMode) tab.view = this.viewMode;
  }

  /**
   * Save before leaving the open document. "conflict": a save conflict for
   * the reader to resolve. "failed": the edits couldn't be written.
   */
  async #flush(): Promise<"saved" | "conflict" | "failed"> {
    // A clean merge with someone else's change leaves the merged text to
    // save. A write that failed isn't retried: one error is enough.
    for (let i = 0; i < 2 && this.dirty && !this.conflict; i++) {
      if (!(await this.save())) return "failed";
    }
    if (this.conflict) return "conflict";
    return this.dirty ? "failed" : "saved";
  }

  /**
   * The one way out of the open document (switching or closing its tab,
   * opening another, Back/Forward, quitting): commit an in-place edit, then
   * save. True when nothing unsaved is left behind. A showing conflict keeps
   * the reader here. Edits that can't be written are the reader's call:
   * discard them and go on (when `quitting`: quit anyway), or stay.
   */
  async #leave({ quitting = false } = {}): Promise<boolean> {
    if (quitting) this.flushCustom();
    this.commitInPlaceEdit?.();
    const flushed = await this.#flush();
    if (flushed !== "failed") return flushed === "saved";
    const [question, okLabel, cancelLabel] = quitting
      ? ["Quit anyway?", "Quit", "Cancel"]
      : ["Discard your changes?", "Discard", "Stay"];
    const go = await ask(`Couldn't save ${this.docName}. ${question}`, {
      title: "Inky",
      kind: "warning",
      okLabel,
      cancelLabel,
    }).catch(() => false);
    if (go && !quitting) this.content = this.savedContent;
    return go;
  }

  /** The active tab with its history and view, to come back to. */
  #place(): TabPlace {
    return { active: this.tabSet.active, nav: this.nav, view: this.viewMode };
  }

  #returnTo(place: TabPlace) {
    this.tabSet.active = place.active;
    this.nav = place.nav;
    this.viewMode = place.view;
  }

  /** Load a tab's document, with its history, view and place. */
  async #loadTab(tab: Tab): Promise<Load> {
    // Never load over edits that still need the reader (openDoc would).
    if (this.conflict) return "blocked";
    this.nav = tab.nav;
    // Focus mode stays in writing view; the tab's view returns when it ends.
    if (!this.focusMode) this.viewMode = tab.view;
    // No saved offset (just restored): the reading-position resume applies.
    const opts = { fromTab: true, silent: true, restoreScroll: tab.scroll ?? undefined };
    const first = await this.#open(tab.path, opts);
    if (first !== "failed") return first;
    // An outside document of a closed workspace, or from before a relaunch.
    const seq = this.#loadSeq;
    const granted = await invoke<string>("restore_tab", { path: tab.path }).catch(() => null);
    if (seq !== this.#loadSeq) return "superseded";
    return granted === null ? "failed" : this.#open(granted, opts);
  }

  /**
   * Load the active tab. One that can't be opened is dropped and the next
   * active one tried, until one loads or none are left. Says how it went for
   * the tab that was active to begin with. A superseded or blocked load
   * stops here and drops nothing.
   */
  async #showActive({ quiet = false } = {}): Promise<Load> {
    const wanted = this.tabSet.active;
    for (let tab = activeTab(this.tabSet); tab; tab = activeTab(this.tabSet)) {
      const result = await this.#loadTab(tab);
      if (result === "loaded") return tab.id === wanted ? "loaded" : "failed";
      if (result !== "failed") return result;
      if (!quiet) toast.error(`Could not open ${tab.path.split("/").pop()}`);
      dropTabs(this.tabSet, tab.path);
      this.#persistTabs();
    }
    this.closeDoc();
    return "failed";
  }

  /** Switch to a tab; false when unsaved edits hold the reader here, or it failed. */
  async activateTab(id: string): Promise<boolean> {
    if (id === this.tabSet.active) return true;
    if (!this.tabSet.tabs.some((t) => t.id === id)) return false;
    if (!canLeave(!(await this.#leave()), id, this.tabSet)) return false;
    const before = this.#place();
    this.#stashActive();
    this.tabSet.active = id;
    // Persisted by openDoc once it loads (or as tabs that fail are dropped).
    const result = await this.#showActive();
    // Edits came up that need the reader: back to the tab that shows them.
    if (result === "blocked") this.#returnTo(before);
    return result === "loaded";
  }

  /**
   * Open `path` in a new tab right after the active one, or focus the tab
   * that already shows it. A background tab is only listed, not loaded.
   */
  async openInTab(path: string, opts: { background?: boolean } = {}): Promise<boolean> {
    const found = findTab(this.tabSet, path);
    if (found) return opts.background || this.activateTab(found.id);
    if (opts.background && this.tabSet.active) {
      addTab(this.tabSet, path, this.#defaultView(), { background: true });
      this.#persistTabs();
      return true;
    }
    if (!(await this.#leave())) return false;
    const before = this.#place();
    this.#stashActive();
    const { id } = addTab(this.tabSet, path, this.#defaultView()).tab;
    const tab = activeTab(this.tabSet)!;
    this.nav = tab.nav;
    if (!this.focusMode) this.viewMode = tab.view;
    // openDoc lists the tab once the document has loaded.
    const result = await this.#open(path, { fromTab: true });
    if (result === "loaded") return true;
    // Superseded: a later load owns the tabs; this one stays, unloaded.
    if (result !== "superseded") {
      // It didn't load: the tab goes, and the one before is still shown.
      removeTab(this.tabSet, id);
      this.#returnTo(before);
    }
    return false;
  }

  async closeTab(id: string) {
    const closingActive = id === this.tabSet.active;
    // Closing the active tab leaves its document: never with edits behind.
    const held = closingActive && !(await this.#leave());
    const i = this.tabSet.tabs.findIndex((t) => t.id === id);
    if (i < 0) return;
    // What shows afterwards: a neighbour, or the same tab for a background close.
    const next = closingActive
      ? ((this.tabSet.tabs[i + 1] ?? this.tabSet.tabs[i - 1])?.id ?? "")
      : (this.tabSet.active ?? "");
    if (!canLeave(held, next, this.tabSet)) return;
    removeTab(this.tabSet, id);
    this.#persistTabs();
    if (!closingActive) return;
    if (this.tabSet.active) {
      await this.#showActive();
    } else {
      // The last tab, and its history, are gone.
      this.closeDoc();
      this.nav = emptyHistory();
    }
  }

  /** ⌘W: close the active tab, or the window when no tab is open. */
  async closeActiveTab() {
    if (this.tabSet.active) await this.closeTab(this.tabSet.active);
    else await getCurrentWindow().close();
  }

  async cycleTabs(step: 1 | -1) {
    const id = cycleTab(this.tabSet, step);
    if (id) await this.activateTab(id);
  }

  moveTab(id: string, toIndex: number) {
    placeTab(this.tabSet, id, toIndex);
    this.#persistTabs();
  }

  /**
   * Save the open document. Only edits are ever written, and only on top of
   * the version Inky last loaded: if the file changed since (an agent
   * edited it), nothing is overwritten; the change is merged in instead.
   */
  /** False only when the edits couldn't be written (a conflict or merge is not a failure). */
  async save(): Promise<boolean> {
    if (!this.currentPath) return true;
    if (this.#autosaveTimer) {
      clearTimeout(this.#autosaveTimer);
      this.#autosaveTimer = null;
    }
    if (this.conflict) return true;
    const path = this.currentPath;
    const text = this.content;
    const base = this.savedContent;
    // An unedited buffer is never written: it could only clobber a newer file.
    if (text === base) return true;
    return (await this.#write(path, text, base)) !== "failed";
  }

  /** Write `text` if the file still holds `expected`; merge otherwise. */
  async #write(path: string, text: string, expected: string): Promise<"written" | "conflict" | "failed"> {
    try {
      const res = await invoke<{ status: "written" } | { status: "conflict"; disk: string }>(
        "write_doc",
        { path, content: text, expected },
      );
      if (res.status === "conflict") {
        await this.#takeDiskChange(path, res.disk);
        return "conflict";
      }
      if (path === this.currentPath) this.savedContent = text;
      this.#noteOwnEdit(path, text);
      return "written";
    } catch (e) {
      toast.error(`Save failed: ${e}`);
      return "failed";
    }
  }

  /**
   * The file on disk now holds `theirs` (someone else saved it). With no
   * edits of ours, just show it; with edits, merge them into it; where both
   * changed the same paragraph, ask (the conflict dialog).
   */
  async #takeDiskChange(path: string, theirs: string) {
    if (path !== this.currentPath) return;
    const base = this.savedContent;
    const mine = this.content;
    if (theirs === base) return;
    this.savedContent = theirs;
    if (mine === base || mine === theirs) {
      this.content = theirs;
      this.#recomputeChanges();
      return;
    }
    const merged = merge3(base, mine, theirs);
    if (merged.conflicts.length === 0) {
      this.content = merged.text;
      this.#recomputeChanges();
      toast.info(`${path.split("/").pop()} changed outside Inky; your edits were merged in.`);
      if (this.content !== this.savedContent) this.scheduleAutosave();
      return;
    }
    this.conflict = { path, mine, theirs, merged: merged.text, conflicts: merged.conflicts };
  }

  /** Conflict dialog: take their version (dropping the reader's edits). */
  useTheirVersion() {
    const c = this.conflict;
    if (!c || c.path !== this.currentPath) return;
    this.conflict = null;
    this.content = c.theirs;
    this.#recomputeChanges();
  }

  /** Conflict dialog: their version plus the reader's edits that don't clash. */
  async useMergedVersion() {
    const c = this.conflict;
    if (!c || c.path !== this.currentPath) return;
    this.conflict = null;
    this.content = c.merged;
    this.#recomputeChanges();
    if (c.merged !== c.theirs) await this.#write(c.path, c.merged, c.theirs);
  }

  /** Conflict dialog: write the reader's version over theirs (library
   *  documents keep theirs in version history). */
  async keepMyVersion() {
    const c = this.conflict;
    if (!c || c.path !== this.currentPath) return;
    this.conflict = null;
    this.content = c.mine;
    await this.#write(c.path, c.mine, c.theirs);
  }

  /** Conflict dialog: keep both — the reader's version as a new document
   *  next to it, and theirs in place. */
  async saveMineAsCopy() {
    const c = this.conflict;
    if (!c || c.path !== this.currentPath) return;
    const dir = c.path.slice(0, c.path.lastIndexOf("/"));
    const file = c.path.split("/").pop() ?? "Untitled.md";
    const ext = file.match(/\.(md|markdown|mmd)$/i)?.[1] ?? "md";
    const stem = file.replace(/\.(md|markdown|mmd)$/i, "");
    try {
      const copy = await invoke<string>("create_doc", { dir, name: `${stem} (my edits)`, ext, content: c.mine });
      await this.refreshTree();
      this.useTheirVersion();
      toast.success(`Your version was saved as ${copy.split("/").pop()}`, {
        action: { label: "Open", onClick: () => this.openInTab(copy) },
      });
    } catch (e) {
      toast.error(`Could not save a copy: ${e}`);
    }
  }

  scheduleAutosave() {
    if (this.#autosaveTimer) clearTimeout(this.#autosaveTimer);
    this.#autosaveTimer = setTimeout(() => {
      this.#autosaveTimer = null;
      if (!this.conflict) this.save();
    }, 1200);
  }

  /** Drop unsaved edits and show the document as it is on disk. */
  async reloadFromDisk() {
    this.conflict = null;
    const path = this.currentPath;
    if (!path) return;
    try {
      const text = await invoke<string>("read_doc", { path });
      this.content = text;
      this.savedContent = text;
      this.#recomputeChanges();
    } catch (e) {
      toast.error(`Could not reload: ${e}`);
    }
  }

  // --- changes since last read (see $lib/changes) ----------------------------

  async #loadChanges(path: string, text: string) {
    const base = await invoke<string | null>("read_baseline", { path }).catch(() => null);
    if (this.currentPath !== path) return;
    if (base === null) {
      // First visit: what the reader sees now is what they have read.
      this.#baseline = text;
      this.changes = null;
      invoke("write_baseline", { path, content: text }).catch(() => {});
      return;
    }
    this.#baseline = base;
    this.#recomputeChanges();
  }

  #recomputeChanges() {
    this.changes =
      this.#baseline === null || this.isMermaidDoc ? null : diffBlocks(this.#baseline, this.content);
  }

  /** The reader's own saved edits count as read; unread changes stay unread. */
  #noteOwnEdit(path: string, text: string) {
    if (path !== this.currentPath || this.#baseline === null) return;
    this.#baseline = this.changes ? baselineAfterEdit(text, this.changes) : text;
    this.#recomputeChanges();
    invoke("write_baseline", { path, content: this.#baseline }).catch(() => {});
  }

  markAsRead() {
    const path = this.currentPath;
    if (!path) return;
    this.#baseline = this.content;
    this.changes = null;
    invoke("write_baseline", { path, content: this.content }).catch(() => {});
  }

  async newDoc(dir?: string, kind: "markdown" | "mermaid" = "markdown") {
    const isMermaid = kind === "mermaid";
    try {
      const path = await invoke<string>("create_doc", {
        dir: dir ?? this.activeRoot,
        name: isMermaid ? "Untitled diagram" : "Untitled",
        ext: isMermaid ? "mmd" : "md",
        content: isMermaid ? MERMAID_TEMPLATE : "# Untitled\n\n",
      });
      await this.refreshTree();
      await this.openInTab(path);
      return path;
    } catch (e) {
      toast.error(`Could not create document: ${e}`);
    }
  }

  async newFolder(dir: string | undefined, name: string) {
    try {
      await invoke("create_folder", { dir: dir ?? this.activeRoot, name });
      if (dir && dir !== this.activeRoot) this.setExpanded(dir, true);
      await this.refreshTree();
    } catch (e) {
      toast.error(`Could not create folder: ${e}`);
    }
  }

  async renamePath(path: string, newName: string) {
    try {
      const newPath = await invoke<string>("rename_path", { path, newName });
      await this.#pathMoved(path, newPath);
    } catch (e) {
      toast.error(`Rename failed: ${e}`);
    }
  }

  /** Rename the currently open document (used by the editable title bar). */
  async renameCurrentDoc(newStem: string) {
    if (!this.currentPath) return;
    const stem = newStem.trim();
    if (!stem) return;
    const ext = this.docName.match(/\.(md|markdown|mmd)$/i)?.[0] ?? ".md";
    if (stem + ext === this.docName) return;
    await this.renamePath(this.currentPath, stem + ext);
  }

  async deletePath(path: string) {
    const name = path.split("/").pop() ?? path;
    try {
      const token = await invoke<string | null>("delete_path", { path });
      await this.#pathDeleted(path);
      // Highlights are the reader's own work: drop them only once the delete
      // is final, so Undo brings the document back with them.
      const forgetHighlights = () => {
        if (forgetInStore(this.highlightStore, path)) this.#saveHighlights();
      };
      if (!token) {
        forgetHighlights();
        toast.success("Moved to Trash");
        return;
      }
      // Parked in the undo stash; it goes to the Trash when the toast expires.
      const purge = () => {
        forgetHighlights();
        invoke("purge_delete", { token }).catch(() => {});
      };
      const timer = setTimeout(purge, 8_000);
      toast.success(`Deleted ${name}`, {
        duration: 8_000,
        action: {
          label: "Undo",
          onClick: async () => {
            clearTimeout(timer);
            try {
              await invoke<string>("undo_delete", { token });
              await this.refreshTree();
            } catch (e) {
              toast.error(`Undo failed: ${e}`);
            }
          },
        },
        onDismiss: () => {
          clearTimeout(timer);
          purge();
        },
      });
    } catch (e) {
      toast.error(`Delete failed: ${e}`);
    }
  }

  async pasteAsNewDoc() {
    let text: string;
    try {
      text = await readText();
    } catch {
      toast.error("Clipboard is empty or does not contain text");
      return;
    }
    if (!text?.trim()) {
      toast.error("Clipboard is empty");
      return;
    }
    const trimmed = text.trimStart();
    const isMermaid =
      /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph|quadrantChart|xychart)/.test(
        trimmed,
      );
    const heading = trimmed.match(/^#{1,6}\s+(.+)$/m)?.[1]?.slice(0, 60);
    try {
      const path = await invoke<string>("create_doc", {
        dir: this.libraryRoot,
        name: heading ?? (isMermaid ? "Pasted diagram" : "Pasted note"),
        ext: isMermaid ? "mmd" : "md",
        content: text,
      });
      await this.refreshTree();
      await this.openInTab(path);
      toast.success("Clipboard pasted as new document");
    } catch (e) {
      toast.error(`Paste failed: ${e}`);
    }
  }

  async copyMarkdown() {
    await writeText(this.content);
    toast.success("Markdown copied");
  }

  async copyHtml(html: string) {
    await writeText(html);
    toast.success("HTML copied");
  }

  /** Ensure the preview is the only thing on the page before printing. */
  async #enterPrintLayout() {
    await this.save();
    if (this.viewMode !== "preview") {
      this.setViewMode("preview");
      // Let the preview lay out (and mermaid render) before printing.
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  async exportPdf() {
    if (!this.currentPath) return;
    const defaultName = this.docName.replace(/\.(md|markdown|mmd)$/i, "") + ".pdf";
    const savePath = await save({
      defaultPath: defaultName,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!savePath) return;
    await this.#enterPrintLayout();
    try {
      await invoke("print_document", { savePath });
    } catch (e) {
      toast.error(`PDF export failed: ${e}`);
      return;
    }
    // The print operation finishes asynchronously; confirm once the file lands.
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await invoke<boolean>("path_exists", { path: savePath })) {
        const { openPath, revealItemInDir } = await import("@tauri-apps/plugin-opener");
        toast.success(`PDF saved: ${savePath.split("/").pop()}`, {
          duration: 10000,
          action: {
            label: "Open",
            onClick: () => openPath(savePath).catch((e) => toast.error(`Could not open PDF: ${e}`)),
          },
          cancel: {
            label: "Show in Finder",
            onClick: () => revealItemInDir(savePath).catch((e) => toast.error(`${e}`)),
          },
        });
        return;
      }
    }
    toast.error("PDF export did not complete");
  }

  async printDoc() {
    if (!this.currentPath) return;
    await this.#enterPrintLayout();
    try {
      await invoke("print_document", { savePath: null });
    } catch (e) {
      toast.error(`Print failed: ${e}`);
    }
  }

  async refreshRecents() {
    this.recentDocs = await invoke<string[]>("recent_docs").catch(() => []);
  }

  /** Open from the recents list (re-grants documents outside the library). */
  async openRecent(path: string) {
    try {
      const resolved = await invoke<string>("open_recent", { path });
      await this.openInTab(resolved);
    } catch (e) {
      toast.error(`Could not open document: ${e}`);
    }
  }

  async handleOpenRequest(req: OpenRequest) {
    if (req.kind === "folder") {
      this.workspace = req.path;
      this.sidebarVisible = true;
      await this.refreshTree();
    } else {
      await this.openInTab(req.path);
    }
    getCurrentWindow().setFocus().catch(() => {});
  }

  async closeWorkspace() {
    await invoke("clear_workspace", { keep: this.tabSet.tabs.map((t) => t.path) });
    this.workspace = null;
    await this.refreshTree();
  }

  async installCli() {
    try {
      const path = await invoke<string>("install_cli");
      toast.success(`Installed ${path}. Try: inky README.md`);
    } catch (e) {
      if (!String(e).includes("User canceled")) toast.error(`Could not install the command: ${e}`);
    }
  }

  async chooseLibrary() {
    const dir = await open({ directory: true, defaultPath: this.libraryRoot });
    if (typeof dir !== "string") return;
    // Every tab closes with the old library: nothing unsaved may go with it.
    if (!(await this.#leave())) return;
    try {
      await invoke("clear_workspace", { keep: [] });
      this.workspace = null;
      this.libraryRoot = await invoke<string>("set_library_root", { path: dir });
      this.tabSet = emptyTabs();
      this.closeDoc();
      this.nav = emptyHistory();
      this.#persistTabs();
      await this.refreshTree();
      toast.success(`Library: ${dir}`);
    } catch (e) {
      toast.error(`Could not switch library: ${e}`);
    }
  }
}

export const app = new AppState();
