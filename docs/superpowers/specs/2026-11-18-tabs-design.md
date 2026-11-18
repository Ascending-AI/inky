# Tabs

## Why

The reader researches a topic across several long documents and wants them
open at once, jumping between them without losing their place. Today Inky
shows one document; switching means re-finding the other one in the sidebar
or Quick Open.

## Goals

- Several documents open as tabs in the one window.
- Each tab keeps its place: scroll position, view (Reading / Split / Writing)
  and its own Back/Forward history.
- Open tabs come back, in order, with the same active tab, after quitting and
  relaunching.

## Non-goals

- Multiple windows, tab tear-off, or split panes showing two tabs at once.
- Empty tabs. There is no "new tab" command and no blank-tab page.
- Pinned tabs, tab groups, a tab overview.

## Anti-goals

- Reading one document must look the same as today. The tab bar only shows
  when two or more tabs are open.
- No lost edits. Switching or closing a tab never drops unsaved text and
  never bypasses the existing safe-save and merge rules.
- No new security surface: an open tab must not widen what the app can read.

## Behaviour (decided with the user)

- **Sidebar click** opens the document in a new tab, focused. If it is
  already open in a tab, that tab is focused instead (no duplicates).
- **⌘-click or middle-click** in the sidebar opens a new tab in the
  background: the current tab stays focused.
- **⌘N** still creates a new document; the new document opens in a new tab.
- **Tabs are restored** on relaunch.

## Behaviour (my calls, shown to the user and not objected to)

- **Tab bar** sits directly under the toolbar, full width of the document
  area (not over the sidebar). Each tab shows the document name without its
  extension, a dot when it has unsaved edits, and a × on hover / on the
  active tab. Full path in the tooltip.
- **Closing:** ⌘W closes the active tab (today it closes the window).
  Middle-click on a tab and its × also close it. Closing the last tab leaves
  the window open with the existing no-document state. The tab to the right
  becomes active, else the one to the left.
- **Switching:** ⌃Tab / ⌃⇧Tab and ⌘⇧] / ⌘⇧[ go to the next / previous tab
  (wrapping). ⌘1–⌘3 stay as the view shortcuts, so there are no
  number-to-tab shortcuts.
- **Every other way of opening a document** behaves like a sidebar click
  (new tab, or focus the existing one): Quick Open, Library Search, Open
  Recent, the breadcrumb menus, Finder / Dock / `inky` CLI open requests,
  the agent `open_document` tool, "Open" on the "saved as copy" toast,
  Paste as document, highlight reveal from the Highlights panel.
- **Links inside a document** to another document open in the *same* tab
  (pushing Back history), like a browser. ⌘-click on such a link opens a new
  background tab.
- **Back/Forward** (⌘[ / ⌘]) are per tab and move within that tab.
- **Renames and moves** update the path and title of every affected tab
  (a folder rename updates all tabs beneath it). **Deletes** close affected
  tabs; Undo of a delete does not reopen them.
- **This includes an agent's renames, moves and deletes** (user's decision)
  when the agent uses the HTTP server hosted by the running app. An agent on
  the stdio server (`Inky --mcp`, a separate process) can't notify the app:
  there a tab whose file moved shows "Could not open" and closes when
  focused. Accepted.
- **Reordering:** tabs can be dragged to a new position.
- **Overflow:** tabs shrink to a minimum width (about 120px), then the row
  scrolls horizontally; the active tab is scrolled into view.
- **Window title** follows the active tab.

## How it fits the current code

`AppState` (`src/lib/state.svelte.ts`) holds exactly one open document:
`currentPath`, `content`, `savedContent`, `changes` + `#baseline`,
`conflict`, comment threads, `docSidecars`, `nav` (back/forward), plus
`pendingScroll`. Almost every component reads these directly.

**Approach (my call): only the active tab is loaded.** A tab is a small
record; switching tabs saves the active document (as `openDoc` already does),
stores the outgoing tab's place, and loads the target through the existing
`openDoc` path with its saved place. The rest of the app keeps reading
`app.currentPath`, `app.content`, etc. unchanged.

Why: it reuses the one battle-tested load/save/merge path, keeps memory flat
with 20 research reports open, and means background tabs can never hold
stale edits that collide with an agent's write. The cost is a re-read and
re-render on each switch; long documents render fast enough today that this
is acceptable, and the reading position restore already exists.

Rejected: keeping every tab's buffer, changes and comments live in memory
(rewrites most of `AppState`, every disk-change and merge path becomes
per-tab, and a background tab with unsaved edits racing an agent is exactly
the lost-work case the app was hardened against).

### Tab record

```ts
interface Tab {
  id: string;          // stable, for keyed rendering and drag
  path: string;        // absolute
  view: ViewMode;      // reading / split / editor
  nav: NavHistory;     // this tab's back/forward stacks
  scroll: number | null; // last scroll offset, restored on switch
}
```

- `app.tabs: Tab[]`, `app.activeTabId`. `currentPath` stays the loaded
  document and always equals the active tab's path (or `null` with no tabs).
- `app.nav` and `app.viewMode` become the active tab's values: swapped in and
  out on switch, so existing back/forward and view code is untouched.
  `inky.viewMode` in localStorage stays the default view for *new* tabs and
  is updated whenever the reader changes view.
- Scroll on switch: the outgoing tab stores its scroll offset (the same value
  `#here()` already captures for Back history); the incoming tab is opened
  with `restoreScroll`. On relaunch, tabs restore through the existing
  per-document reading position (`readpos.ts`), not pixel offsets.

### Opening

`openDoc(path, opts)` keeps its meaning ("show this document in the active
tab", used by link-follow and history). New entry point, my naming:
`openInTab(path, { background?: boolean })`:

1. If a tab already has `path`: focus it (unless background) and return.
2. Otherwise insert a new tab right after the active tab.
3. Not background: switch to it (save outgoing, `openDoc`).
   Background: just add the record; nothing is loaded until it is focused.

All the callers listed under Behaviour switch from `openDoc` to
`openInTab`. Link-follow in `Preview.svelte` keeps `openDoc` (same tab)
except with ⌘ held.

With no tabs open, `openDoc` creates the first tab.

**Duplicates (my call):** only the "open" entry points dedupe. Following a
link or Back/Forward inside a tab may land on a document another tab
already shows; that is allowed, as in a browser. `openInTab` focuses the
first tab with the path. Renames remap, and deletes close, every tab with
the path; the unsaved-edits dot only ever applies to the active tab, since
background tabs hold no buffer.

**Conflicts:** `openDoc` already refuses to leave a document with an
unresolved save conflict. Tab switching and closing go through the same
check: while a conflict is shown, switching/closing the conflicted tab is
blocked with the existing conflict dialog in view. Background opens are
still allowed (they don't load anything).

**Image previews and the zoom viewer** belong to the moment, not the tab:
switching tabs closes them, as opening a document does today.

### Closing

`closeTab(id)`: if it is the active tab, save first (abort on conflict),
then activate the neighbour (right, else left) via `openDoc`, or call the
existing `closeDoc()` when it was the last tab. Background tab: drop the
record.

### Persistence

- `localStorage["inky.tabs"]` = `{ tabs: [{ path, view }], active: index }`,
  written on every tab change. Back/forward stacks and pixel scroll are not
  persisted (my call: history across relaunch is noise, position comes
  from readpos).
- Replaces `inky.lastDoc`. On first run after upgrade, if `inky.tabs` is
  missing and `inky.lastDoc` exists, it becomes a single tab.
- Startup: tabs are restored as records; only the active one is loaded.
  Paths outside the library need a grant again after relaunch (the
  workspace is not persisted, so workspace documents count as outside too).
  `open_recent` can't be the source: recents cap at 20 and background tabs
  never enter it. **My call:** Rust persists its own list of open tab paths
  in `config.json` (written by `set_open`, below), and a new command
  `restore_tab(path)` grants a path only if it is on that Rust-side list.
  The localStorage list only orders the tabs; it is never trusted for
  grants, since the webview can write it.
  A tab whose file is gone is dropped silently when it fails to load on
  startup; when focused later, it shows the existing "Could not open" toast
  and closes.
- Open requests at launch (Finder, CLI) open in tabs *after* restored ones,
  and the last one is focused.

### Rust: grants for open tabs

`Places` (`src-tauri/src/places.rs`) tracks one `current` document so a
document opened from a workspace stays readable when the workspace is closed
or replaced (`close_workspace(keep)`). With tabs, *every* open tab in the
workspace must stay reachable.

- Replace `current: Option<PathBuf>` with `open: HashSet<PathBuf>` and
  `set_current` with `set_open(paths)` (the full tab list, called from the
  frontend whenever tabs change, via a new command or by extending
  `note_recent`; builder's choice).
- `close_workspace` keeps a single-file grant for each open path inside the
  workspace, using the same `is_file && is_doc` check as now.
- `clear_workspace` command: `keep: Vec<String>` instead of `Option<String>`.
- `set_open` accepts only paths the app can already reach (the same rule
  `note_recent` applies), so it can't be used to create a grant. Rust still
  resolves each through the workspace library on close, so nothing outside
  it can be smuggled in. The accepted list is what `config.json` stores for
  `restore_tab`. Add tests next to the existing `set_current` test.

### Rust: agent renames, moves and deletes reach the tabs

`mcp.rs` already has an injectable hook, `Opener`, that the app sets with
`with_opener` so `open_document` can reach the window. Add a second hook in
the same style, e.g. `PathEvents` (`moved(from, to)`, `deleted(path)`),
called by `rename_document`, `move_document` and `delete_document` after
they succeed, with absolute paths. The default (stdio server) does nothing;
the app-hosted HTTP server emits a `path-moved` / `path-deleted` event.

The frontend handles these with the same code as in-app renames, moves and
deletes (tab remap/close, plus what `renamePath`/`deletePath` already do
for nav history, read positions, highlights, baselines and expanded
folders), but without calling the Rust rename itself. Factor that
bookkeeping out of `movePath`/`renamePath`/`deletePath` so both paths share
it. Add MCP tests using the recording pattern of `fixture_recording_opens`.

### Menus and shortcuts

**Branch (my call):** build on `main`, macOS first. The unmerged `windows`
branch has the per-platform menus, `runAction`/`shortcutAction`, the 500ms
menu/keydown de-dup and `modKey`; whichever lands second adapts to the
other (Ctrl equivalents for Windows come with that merge). References below
to those pieces mean "the equivalent on `main`" (`handleMenu`,
`handleKeydown`, `e.metaKey`).

- `src-tauri/src/lib.rs`: the File menu's predefined Close Window item
  becomes a custom "Close Tab" (CmdOrCtrl+W) that emits a menu action; the
  red button still closes the window. On non-macOS the File menu gets the
  same item. Add "Next Tab" / "Previous Tab" (Ctrl+Tab, Ctrl+Shift+Tab;
  ⌘⇧] / ⌘⇧[ as page shortcuts) to the Window menu (View on non-macOS).
- `+page.svelte` `runAction` / `shortcutAction`: `close_tab`, `next_tab`,
  `prev_tab`, with the existing 500ms de-dup.
- With no tabs open, ⌘W closes the window as today.

### UI

- New `src/lib/components/TabBar.svelte`, rendered by `+page.svelte` above
  the document area when `app.tabs.length >= 2`. Uses existing shadcn
  styling and theme tokens; must look right in Light, Dark and Book, and be
  hidden in focus mode.
- Tab drag reorder with HTML5 drag events (like `TreeItem`), its own drag
  type so tabs can't be dropped on sidebar folders.
- Sidebar (`TreeItem.svelte`), breadcrumb menus (`Toolbar.svelte`): read
  `e.metaKey` / middle button (`auxclick`, button 1) for background open.
  Use `modKey(e)` from the windows branch's `platform.ts` if it has been
  merged; otherwise `e.metaKey`.
- The sidebar marks only the active document, as now, not every open tab
  (my call, keeps the sidebar calm).

## Testing

- Pure helpers in a new `src/lib/tabs.ts` with tests in `tests/tabs.test.ts`:
  insert-after-active, dedupe/focus, close-and-pick-neighbour, remap on
  rename/move (folder prefix), drop on delete, reorder, serialize/parse of
  the stored list (malformed input reads as no tabs), migration from
  `inky.lastDoc`.
- Rust tests for `Places` keeping every open document on workspace close.
- Manual pass in the built app: open several reports, switch with
  shortcuts and clicks, edit in one and switch (autosaved, no prompt),
  agent edit to a background tab then switch (shows What changed), rename a
  folder with open tabs, delete an open document, ⌘W down to zero, quit and
  relaunch.

## Left to the builder

- Exact visual design of the tab bar within the existing toolbar style.
- Whether `set_open` is its own command or folded into `note_recent`.
- Internal naming and file layout beyond what is fixed above.
