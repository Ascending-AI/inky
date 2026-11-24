<script lang="ts">
  import { isMac, modKey } from "$lib/platform";
  import { onMount } from "svelte";
  import { startDisplayLog } from "$lib/displaylog";
  import { slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { listen } from "@tauri-apps/api/event";
  import { app } from "$lib/state.svelte";
  import { configureSync } from "$lib/scrollsync";
  import { pinchScale } from "$lib/zoom";
  import type { ReadingWidth } from "$lib/state.svelte";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import TabBar from "$lib/components/TabBar.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import Editor from "$lib/components/Editor.svelte";
  import Preview from "$lib/components/Preview.svelte";
  import TocPanel from "$lib/components/TocPanel.svelte";
  import CommentsPanel from "$lib/components/CommentsPanel.svelte";
  import SearchBar from "$lib/components/SearchBar.svelte";
  import QuickOpen from "$lib/components/QuickOpen.svelte";
  import LibrarySearch from "$lib/components/LibrarySearch.svelte";
  import HistoryPanel from "$lib/components/HistoryPanel.svelte";
  import HighlightsPanel from "$lib/components/HighlightsPanel.svelte";
  import ThemesPanel from "$lib/components/ThemesPanel.svelte";
  import ConflictDialog from "$lib/components/ConflictDialog.svelte";
  import McpSetupDialog from "$lib/components/McpSetupDialog.svelte";
  import ThemeEditor from "$lib/components/ThemeEditor.svelte";
  import ImagePreview from "$lib/components/ImagePreview.svelte";
  import VideoView from "$lib/components/VideoView.svelte";
  import ZoomViewer from "$lib/components/ZoomViewer.svelte";
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import FilePlus from "@lucide/svelte/icons/file-plus-2";
  import ClipboardPaste from "@lucide/svelte/icons/clipboard-paste";

  let ready = $state(false);

  function storedWidth(key: string, fallback: number, min: number, max: number): number {
    const v = parseInt(localStorage.getItem(key) ?? "", 10);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  }

  let sidebarWidth = $state(240);
  let tocWidth = $state(256);

  function runAction(id: string) {
    const actions: Record<string, () => void> = {
      go_back: () => app.goBack(),
      go_forward: () => app.goForward(),
      new_doc: () => app.newDoc(),
      new_diagram: () => app.newDoc(undefined, "mermaid"),
      paste_new: () => app.pasteAsNewDoc(),
      save: () => app.save(),
      close_tab: () => app.closeActiveTab(),
      next_tab: () => app.cycleTabs(1),
      prev_tab: () => app.cycleTabs(-1),
      export_pdf: () => app.exportPdf(),
      print: () => app.printDoc(),
      find: () => app.openSearch(),
      search_library: () => (app.librarySearchVisible = true),
      install_cli: () => app.installCli(),
      history: () => {
        if (app.currentPath && app.docSidecars) app.historyVisible = true;
      },
      view_reading: () => app.setViewMode("preview"),
      view_split: () => app.setViewMode("split"),
      view_writing: () => app.setViewMode("editor"),
      toggle_sidebar: () => app.toggleSidebar(),
      toggle_toc: () => app.toggleToc(),
      toggle_comments: () => app.toggleComments(),
      sync_scroll: () => app.toggleSyncScroll(),
      focus_mode: () => app.toggleFocusMode(),
      quick_open: () => (app.quickOpenVisible = true),
      check_updates: () => app.checkForUpdates(true),
      edit_themes: () => app.openThemeEditor(),
      font_plus: () => app.adjustFontScale(1),
      font_minus: () => app.adjustFontScale(-1),
      quit_app: () => app.quitApp(),
    };
    if (id.startsWith("width_")) {
      app.setReadingWidth(id.slice(6) as ReadingWidth);
      return;
    }
    if (id.startsWith("theme:")) {
      app.setTheme(id.slice(6));
      return;
    }
    actions[id]?.();
  }

  /**
   * A shortcut can reach us twice: as a native-menu accelerator and as a
   * keydown in the page (Windows delivers both; macOS only the menu). Run it
   * once.
   */
  let last = { id: "", from: "", at: 0 };
  function fire(id: string, from: "menu" | "key") {
    const now = performance.now();
    if (last.id === id && last.from !== from && now - last.at < 500) return;
    last = { id, from, at: now };
    runAction(id);
  }

  onMount(() => {
    sidebarWidth = storedWidth("inky.sidebarWidth", 240, 180, 420);
    tocWidth = storedWidth("inky.tocWidth", 256, 200, 480);
    configureSync(() => app.syncScroll && app.viewMode === "split");
    const unlisten = listen<string>("menu", (e) => fire(e.payload, "menu"));
    startDisplayLog();
    app.init().then(() => (ready = true));
    // Registered by hand: they must be non-passive to stop the webview's own
    // pinch handling, and Svelte attaches wheel listeners as passive.
    const opts = { passive: false };
    window.addEventListener("wheel", onWheel, opts);
    window.addEventListener("gesturestart", onGestureStart, opts);
    window.addEventListener("gesturechange", onGestureChange, opts);
    window.addEventListener("gestureend", onGestureEnd, opts);
    return () => {
      unlisten.then((fn) => fn());
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("gesturestart", onGestureStart);
      window.removeEventListener("gesturechange", onGestureChange);
      window.removeEventListener("gestureend", onGestureEnd);
    };
  });

  /**
   * Column-resize drag for the side panels. `sign` is +1 when dragging right
   * grows the panel (sidebar) and -1 when it shrinks it (TOC).
   */
  function startPanelDrag(
    e: PointerEvent,
    opts: { get: () => number; set: (w: number) => void; sign: 1 | -1; min: number; max: number; storageKey: string },
  ) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = opts.get();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const w = startW + opts.sign * (ev.clientX - startX);
      opts.set(Math.min(opts.max, Math.max(opts.min, w)));
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      localStorage.setItem(opts.storageKey, String(Math.round(opts.get())));
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }

  /** Typing surfaces where ⌘[ / ⌘] already mean outdent / indent. */
  function inTextInput(target: EventTarget | null) {
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable || target.closest("input, textarea, .cm-editor") !== null)
    );
  }

  // Trackpad pinch → text size. WebKit reports it as gesture events (with a
  // cumulative scale) and, in some versions, also as ctrl+wheel; while a
  // gesture is live the wheel copies are ignored so it isn't applied twice.
  let pinchBase: number | null = null;

  function onGestureStart(e: Event) {
    e.preventDefault();
    if (app.viewerOpen) return;
    pinchBase = app.fontScale;
  }

  function onGestureChange(e: Event) {
    e.preventDefault();
    const scale = (e as Event & { scale?: number }).scale;
    if (pinchBase !== null && scale) app.setFontScale(pinchBase * scale);
  }

  function onGestureEnd(e: Event) {
    e.preventDefault();
    pinchBase = null;
  }

  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (app.viewerOpen) return;
    if (pinchBase === null) app.setFontScale(pinchScale(app.fontScale, e.deltaY));
  }

  /** Mouse side buttons (3 = back, 4 = forward). */
  function onMouseUp(e: MouseEvent) {
    if (e.button === 3) app.goBack();
    else if (e.button === 4) app.goForward();
  }

  /** The menu action a ⌘/Ctrl shortcut stands for. */
  function shortcutAction(event: KeyboardEvent): string | null {
    const key = event.key.toLowerCase();
    const shift = event.shiftKey;
    // ⌘⇧] / ⌘⇧[: by code, since Shift turns the key into } / { on most layouts.
    if (shift && (event.code === "BracketRight" || event.code === "BracketLeft")) {
      return event.code === "BracketRight" ? "next_tab" : "prev_tab";
    }
    if ((key === "[" || key === "]") && !shift && !inTextInput(event.target)) {
      return key === "[" ? "go_back" : "go_forward";
    }
    if (key === "v") return shift ? "paste_new" : null;
    if (key === "k") return shift ? "search_library" : "quick_open";
    if (key === "c") return shift ? "toggle_comments" : null;
    if (key === "f") return shift ? "focus_mode" : "find";
    if (key === "n") return shift ? null : "new_doc";
    const plain: Record<string, string> = {
      s: "save",
      w: "close_tab",
      p: "print",
      e: "export_pdf",
      "1": "view_reading",
      "2": "view_split",
      "3": "view_writing",
      "\\": "toggle_sidebar",
      b: "toggle_sidebar",
      t: "toggle_toc",
      "=": "font_plus",
      "+": "font_plus",
      "-": "font_minus",
    };
    return plain[key] ?? null;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === "Tab") {
      event.preventDefault();
      app.cycleTabs(event.shiftKey ? -1 : 1);
      return;
    }
    // WebView2's browser keys would reload the app and drop unsaved edits.
    if (!isMac && (event.key === "F5" || (event.ctrlKey && event.key.toLowerCase() === "r"))) {
      event.preventDefault();
      return;
    }
    if (!modKey(event)) return;
    const id = shortcutAction(event);
    if (!id) return;
    event.preventDefault();
    fire(id, "key");
  }
</script>

<svelte:window onkeydown={handleKeydown} onmouseup={onMouseUp} />

<ConflictDialog />

<div class="print-root flex h-screen flex-col overflow-hidden">
  <Toolbar />

  <div class="print-root flex min-h-0 flex-1">
    {#if app.sidebarVisible}
      <div
        class="no-print relative shrink-0"
        style="width: {sidebarWidth}px"
        transition:slide={{ axis: "x", duration: 220, easing: cubicOut }}
      >
        <div class="absolute inset-y-0 left-0" style="width: {sidebarWidth}px">
          <Sidebar />
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="absolute inset-y-0 -right-[3px] z-10 w-1.5 cursor-col-resize transition-colors hover:bg-ring/50 active:bg-ring/70"
          onpointerdown={(e) =>
            startPanelDrag(e, {
              get: () => sidebarWidth,
              set: (w) => (sidebarWidth = w),
              sign: 1,
              min: 180,
              max: 420,
              storageKey: "inky.sidebarWidth",
            })}
        ></div>
      </div>
    {/if}

    <main class="print-root flex min-w-0 flex-1 flex-col">
      {#if app.tabs.length >= 2 && !app.focusMode}
        <TabBar />
      {/if}
      <div class="print-root relative min-h-0 flex-1">
      <SearchBar />
      {#if app.imagePath}
        <ImagePreview />
      {:else if app.mediaView}
        <ZoomViewer
          items={app.mediaView.items}
          index={app.mediaView.index}
          onindex={(i) => app.mediaView && (app.mediaView.index = i)}
          onclose={() => app.closeMedia()}
        />
      {/if}
      {#if !ready}
        <div class="flex h-full items-center justify-center text-muted-foreground">Loading…</div>
      {:else if !app.currentPath}
        <div class="flex h-full flex-col items-center justify-center gap-4 text-center">
          <h1 class="text-2xl font-semibold tracking-tight">Inky</h1>
          <p class="max-w-xs text-sm text-muted-foreground">
            Open a document from the sidebar, create a new one, or paste markdown from your
            clipboard.
          </p>
          <div class="flex gap-2">
            <Button onclick={() => app.newDoc()}>
              <FilePlus class="size-4" /> New document
            </Button>
            <Button variant="outline" onclick={() => app.pasteAsNewDoc()}>
              <ClipboardPaste class="size-4" /> Paste clipboard
            </Button>
          </div>
        </div>
      {:else if app.isVideoTab}
        {#key app.currentPath}
          <VideoView path={app.currentPath} />
        {/key}
      {:else if app.viewMode === "split"}
        <Resizable.PaneGroup direction="horizontal" autoSaveId="inky-split">
          <Resizable.Pane defaultSize={50} minSize={25} class="no-print">
            <Editor />
          </Resizable.Pane>
          <Resizable.Handle class="no-print" />
          <Resizable.Pane defaultSize={50} minSize={25} class="print-root">
            {#key app.currentPath}
              <Preview />
            {/key}
          </Resizable.Pane>
        </Resizable.PaneGroup>
      {:else if app.viewMode === "editor"}
        <Editor />
      {:else}
        {#key app.currentPath}
          <Preview />
        {/key}
      {/if}
      </div>
    </main>

    {#if ready && app.currentPath && app.commentsVisible && !app.isMermaidDoc}
      <div
        class="no-print relative shrink-0"
        style="width: {tocWidth}px"
        transition:slide={{ axis: "x", duration: 220, easing: cubicOut }}
      >
        <div class="absolute inset-y-0 right-0" style="width: {tocWidth}px">
          <CommentsPanel />
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="absolute inset-y-0 -left-[3px] z-10 w-1.5 cursor-col-resize transition-colors hover:bg-ring/50 active:bg-ring/70"
          onpointerdown={(e) =>
            startPanelDrag(e, {
              get: () => tocWidth,
              set: (w) => (tocWidth = w),
              sign: -1,
              min: 200,
              max: 480,
              storageKey: "inky.tocWidth",
            })}
        ></div>
      </div>
    {/if}

    {#if ready && app.currentPath && app.tocVisible && !app.isMermaidDoc && !app.isVideoTab}
      <div
        class="no-print relative shrink-0"
        style="width: {tocWidth}px"
        transition:slide={{ axis: "x", duration: 220, easing: cubicOut }}
      >
        <div class="absolute inset-y-0 right-0" style="width: {tocWidth}px">
          <TocPanel />
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="absolute inset-y-0 -left-[3px] z-10 w-1.5 cursor-col-resize transition-colors hover:bg-ring/50 active:bg-ring/70"
          onpointerdown={(e) =>
            startPanelDrag(e, {
              get: () => tocWidth,
              set: (w) => (tocWidth = w),
              sign: -1,
              min: 200,
              max: 480,
              storageKey: "inky.tocWidth",
            })}
        ></div>
      </div>
    {/if}

    {#if ready && app.highlightsVisible}
      <div
        class="no-print relative shrink-0"
        style="width: {tocWidth}px"
        transition:slide={{ axis: "x", duration: 220, easing: cubicOut }}
      >
        <div class="absolute inset-y-0 right-0" style="width: {tocWidth}px">
          <HighlightsPanel />
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="absolute inset-y-0 -left-[3px] z-10 w-1.5 cursor-col-resize transition-colors hover:bg-ring/50 active:bg-ring/70"
          onpointerdown={(e) =>
            startPanelDrag(e, {
              get: () => tocWidth,
              set: (w) => (tocWidth = w),
              sign: -1,
              min: 200,
              max: 480,
              storageKey: "inky.tocWidth",
            })}
        ></div>
      </div>
    {/if}
    {#if ready && app.themesPanelVisible}
      <div
        class="no-print relative shrink-0"
        style="width: {tocWidth}px"
        transition:slide={{ axis: "x", duration: 220, easing: cubicOut }}
      >
        <div class="absolute inset-y-0 right-0" style="width: {tocWidth}px">
          <ThemesPanel />
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="absolute inset-y-0 -left-[3px] z-10 w-1.5 cursor-col-resize transition-colors hover:bg-ring/50 active:bg-ring/70"
          onpointerdown={(e) =>
            startPanelDrag(e, {
              get: () => tocWidth,
              set: (w) => (tocWidth = w),
              sign: -1,
              min: 200,
              max: 480,
              storageKey: "inky.tocWidth",
            })}
        ></div>
      </div>
    {/if}
  </div>
</div>

<QuickOpen />
<LibrarySearch />
<HistoryPanel />
<McpSetupDialog />
<ThemeEditor />
