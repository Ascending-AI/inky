# Inky 🖋️

A small, pleasant app for macOS and Windows for reading and writing Markdown.
It's built for long documents (including the long research reports AI agents
write) and lets those agents work in your library directly through a built-in
MCP server.

![Inky](src-tauri/icons/128x128.png)

Your documents stay plain `.md` files in a folder you choose. There's no
database, no account, and nothing leaves your computer.

- [Install](#install)
- [Features](#features)
- [Connect an agent (MCP)](#connect-an-agent-mcp)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Files Inky keeps](#files-inky-keeps)
- [Development](#development)
- [Releasing](#releasing)

## Install

Download Inky from <https://inky.ascending.ai>.

- **macOS:** drag it into Applications. It needs an Apple-silicon Mac. The app
  is signed and notarized by Apple, so it opens like any other.
- **Windows** (10 or later, 64-bit): run `Inky-setup.exe`. It installs for
  your user, without admin rights. The installer is not code signed yet, so
  the first time Windows says it protected your PC: choose **More info**, then
  **Run anyway**.

Inky checks for updates on launch and from **Inky → Check for Updates…**
(Windows: **Help → Check for Updates…**).

## Features

### Library

- Documents live in `~/Documents/Inky` by default (**… → Change library
  folder…**). Inky watches the folder, so files that agents or other apps
  write show up right away.
- Folders, drag-and-drop moves, rename (right-click, or click the title in
  the toolbar), and delete with **Undo** (then to the Trash).
- **Quick Open** (⌘K) fuzzy-finds documents and recent files.
  **Search Library** (⌘⇧K) searches every document's text.
- **Tabs**: opening a document opens it in a tab, and ⌘-click opens it in a
  background tab. The tab bar appears once two are open. Drag a tab to
  reorder it (Esc cancels), and tabs are restored on relaunch.
- **Breadcrumbs** in the toolbar show the folder path; each crumb lists that
  folder's documents.
- **Paste as document** (⌘⇧V) turns copied Markdown into a new document.
  Pasted Mermaid source becomes a diagram.
- **Images** in the library appear in the sidebar and open in a viewer.
- **Videos** (MP4, MOV, M4V, WebM) appear in the sidebar and play in their
  own tab. `![caption](clip.mp4)` plays one inside a document; double-click a
  video, or use its controls, for full screen. Space plays and pauses; ← / →
  move back or ahead 5 seconds.
- **`.inkyignore`** hides clutter from the sidebar, search and agents. It
  uses `.gitignore` syntax. **Hide from Inky** in an item's menu writes the
  rule for you, and the sidebar's eye button shows hidden items.

### Opening files from anywhere

- Open any Markdown file or folder from Finder, **File → Open…** (⌘O),
  **Open Folder…** (⌘⇧O), **Open Recent**, or the terminal. An opened folder
  temporarily replaces the library in the sidebar.
- **Inky → Install 'inky' Command in PATH…** adds `inky notes.md` and
  `inky ~/project` to your terminal.
- If a file outside the library changes on disk while you have unsaved
  edits, Inky asks before overwriting it.

### Reading

- **Resume where you left off.** Each document reopens at your last
  position, and a thin bar shows your progress.
- **What changed since you last read it.** After an agent (or anyone)
  edits a document, margin marks show edited (amber), new (green) and removed
  (red) passages. Click a mark to see the earlier text. A banner counts the
  changes, steps through them and marks the document as read.
- **Hover previews.** Footnotes show their text. Links show the target
  section or document. External links show their address without being
  fetched. Clicking a footnote card opens the source it cites.
- **Highlights.** Select text and pick one of six fluorescent colours (H
  reuses the last one). You can add a note to a highlight, recolour it or
  remove it. The **Highlights** panel lists them for one document or all,
  filters by colour and copies them as Markdown.
- **Zoom images and diagrams.** Click one to open a viewer with
  wheel/pinch zoom, panning, and arrow keys through the document's figures.
- **Table of contents** (⌘T) with the current section highlighted.
  **Back/Forward** (⌘[ / ⌘]) between documents.
- **Reading settings** (the `Aa` popover) control font size, text width,
  typeface (San Francisco, New York, Charter, Iowan, Avenir), line and
  paragraph spacing, and a justified, hyphenated book layout. Pinch to zoom
  the text.
- **Themes**: Light, Dark (anthracite, not black) and Book (warm paper
  colours), plus two dozen ready-made themes. The toolbar menu keeps the
  built-in themes, your own and the ones you used recently; **All Themes…**
  opens a panel on the right with a preview card for every theme, which you can
  search or narrow to light or dark. **View → Theme** lists them all too.
  **Edit Themes…** makes your own, and **Custom** holds your last tweak. Themes are colours only: Book's serif type is now a font choice in
  Reading settings. Themes are JSON files in Inky's settings folder, and you can
  import and export them. Ready-made palettes are credited in
  [THEME-CREDITS.md](THEME-CREDITS.md).

### Writing

- **Three views**: Reading (⌘1), Split (⌘2) with synced scrolling, and
  Writing (⌘3), a CodeMirror Markdown editor. Changes autosave. Word count
  and reading time sit next to the title.
- **Edit while reading.** Double-click any paragraph, heading or list and
  type. The block stays rendered, and a floating bar offers formatting.
  ⌘↩ or clicking away applies the edit; Esc cancels. Only the text you
  changed is written back, so the rest of the Markdown stays exactly as it
  was.
- **Task checkboxes** toggle with a click in the reading view.
- **Focus mode** (⌘⇧F) hides everything but the editor and dims all but the
  current paragraph.
- **Find** (⌘F) works in both the preview and the editor.
- **Pasted images** are saved to an `assets/` folder next to the document
  and linked.

### Comments

- Select text and click **Comment** to start a thread. Threads can be
  replied to, resolved, reopened and filtered (⌘⇧C: All / Open / Resolved).
- Comments are anchored to the quoted text and its surroundings, so they
  survive edits elsewhere. If the text is deleted, the thread is kept and
  flagged.
- Agents can read and answer comments too (see [MCP](#connect-an-agent-mcp)).

### Rendering

- **Mermaid** diagrams in ` ```mermaid ` blocks, and `.mmd` files as
  standalone diagrams.
- **Math** with KaTeX: `$…$` inline, `$$…$$` display. Dollar amounts stay
  plain text.
- GFM tables, footnotes and task lists.
- **Code blocks** look like terminal windows in every theme, with a title bar
  showing the language and a Copy button. Inky guesses the language when a block has none. Terminal
  sessions (`$ …`) show the prompt and command apart from the output, and Copy
  takes just the commands. Compact JSON is laid out for reading; the file stays
  as written.
- **PDF export** (⌘E) uses clean print typography whatever your theme.
  **Print** is ⌘P. You can also copy the Markdown source or the rendered HTML.

### Never losing work

- **Safe saves.** Writes are atomic, and Inky never writes over a file that
  changed since it loaded it. Changes on disk are merged with your unsaved
  edits block by block. If you both changed the same passage, a dialog lets
  you keep both, take theirs or keep yours.
- **Version history** (⌘Y). The previous version of a document is kept
  before each overwrite (at most one per 10 minutes, the last 20). Each
  version shows a coloured diff and can be restored in one click. Versions
  written by agents are badged **agent**.
- Unsaved changes are flushed when the window loses focus or closes, and on ⌘Q.

### Privacy and security

- Remote images in documents are blocked by default, because they can be
  used to track when you read something. A pill offers **Load** (this
  document) or **Always**, and Reading settings switch it back.
- Documents can't run scripts, embed frames or restyle the app.
- The MCP server listens only on your Mac and requires a secret token.

## Connect an agent (MCP)

Inky has an MCP server built into the app, so you don't need Node.js or any
other runtime. Agents get these tools:

- **Documents**: `list_documents`, `read_document`, `write_document`,
  `patch_document`, `rename_document`, `move_document`, `create_folder`,
  `delete_document`, `search_documents`
- **History**: `list_versions`, `read_version`
- **Comments**: `list_comments`, `create_comment`, `reply_to_comment`,
  `resolve_comment`
- **App**: `open_document`, which shows a document in the Inky window

Every document is also available as an `inky://doc/…` resource. Agents see the
same library as the app: `INKY_LIBRARY` if set, otherwise the folder chosen in
the app, otherwise `~/Documents/Inky`.

**The easy way:** right-click the **MCP** light in the toolbar. The **Connect
an agent** window has ready-to-copy commands for Claude Code, Claude Desktop
and Codex, with your token filled in.

**HTTP** (while Inky is running). Click the MCP light to start the server
(green means it's live). It listens on `http://127.0.0.1:26317/mcp` and stays
on across launches until you stop it. Requests need the token from the Connect
window:

```sh
claude mcp add --transport http inky http://127.0.0.1:26317/mcp \
  --header "Authorization: Bearer <token>"
```

**stdio** (works even when Inky isn't running). The client launches the app
binary in server mode:

```sh
claude mcp add inky -- "/Applications/Inky.app/Contents/MacOS/Inky" --mcp
```

Claude Desktop (`claude_desktop_config.json`):

```json
{ "mcpServers": { "inky": { "command": "/Applications/Inky.app/Contents/MacOS/Inky", "args": ["--mcp"] } } }
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.inky]
command = '/Applications/Inky.app/Contents/MacOS/Inky'
args = ["--mcp"]
```

ChatGPT's connectors only accept public HTTPS URLs, so they can't reach a
server on your Mac.

Then ask things like *"write yesterday's meeting notes into my Inky library
under Meetings/"* or *"read my Inky doc 'Ideas', answer the open comments and
show it to me"*.

## Keyboard shortcuts

On Windows, Ctrl takes the place of ⌘ (Ctrl+N, Ctrl+Shift+K, …), and the
menus and tooltips show the Windows names.

| Shortcut | Action |
| --- | --- |
| ⌘N | New document |
| ⌘O / ⌘⇧O | Open file / Open folder |
| ⌘K | Quick Open |
| ⌘⇧K | Search library |
| ⌘S | Save (autosave also runs) |
| ⌘Y | Version history |
| ⌘E | Export PDF |
| ⌘P | Print |
| ⌘⇧V | New document from clipboard |
| ⌘1 / ⌘2 / ⌘3 | Reading / Split / Writing view |
| ⌘[ / ⌘] | Back / Forward |
| ⌘W | Close tab (closes the window when none are open) |
| ⌃Tab / ⌃⇧Tab | Next / previous tab |
| ⌘⇧] / ⌘⇧[ | Next / previous tab |
| ⌘-click | Open in a background tab |
| ⌘F | Find in document |
| ⌘T | Table of contents |
| ⌘⇧C | Comments |
| ⌘B or ⌘\ | Sidebar |
| ⌘⇧F | Focus mode |
| ⌘+ / ⌘− | Font size |
| Double-click | Edit a block in the reading view (⌘↩ apply, Esc cancel) |
| H | Highlight the selection in the last colour |
| ⌘Q | Save and quit |

## Files Inky keeps

Inside your library, next to each document:

| File | What it is |
| --- | --- |
| `.«name».comments.json` | The document's comment threads. Moves, renames and deletes carry it along. |
| `.inky-history/` | Earlier versions, for Version history |
| `.inkyignore` | Your hide rules (optional, any folder) |
| `assets/` | Images pasted into documents |

In `~/Library/Application Support/com.inky.app/`: `config.json` (library
folder, recent files, MCP token), `highlights.json`, `themes/` (your themes
and Custom, one JSON file each), and `read-baselines/` (the "last read" copies
behind *What changed*).

## Development

You need Rust (stable), Node 20+ and pnpm.

```sh
pnpm install
make dev
```

The frontend is SvelteKit with Svelte 5, Tailwind CSS 4 and shadcn-svelte. The
backend is Tauri 2 and Rust; the MCP server is `src-tauri/src/mcp.rs`. Run
`make` to list the tasks:

| Target | What it does |
| --- | --- |
| `make dev` | Run the app with hot reload |
| `make check` | Type-check the frontend and Rust, run the Rust and release-script tests (`pnpm test` runs the frontend tests) |
| `make dmg` | Build the `.app`, `.dmg` and updater artifacts for your own Mac |
| `make release` | The release build: what CI runs on a tag (see [Releasing](#releasing)) |
| `make web-dev` / `make web-build` / `make web-check` | The download site in `web/` |
| `make icons` | Regenerate all app icons from `assets/icon.svg` |
| `make open` | Open the last built app |
| `make mcp` | Run the MCP server on stdio (dev build) |
| `make clean` | Remove build outputs |

Windows: the same code builds a per-user NSIS installer
(`src-tauri/tauri.windows.conf.json`). CI's `windows` job (`check.yml`) runs
the tests on Windows, builds the installer, installs it, and drives the app
through WebDriver (`scripts/smoke-windows.mjs`, `e2e/windows.mjs`). Each run
keeps the installer as the artifact `inky-windows-installer`, to try on a PC.

`make dmg` signs the update files with `~/.tauri/inky.key` (override with
`make dmg KEY=…`). Plain `pnpm tauri build` fails without it; `pnpm bundle` is
an alias for `make dmg`. It produces:

- `src-tauri/target/release/bundle/macos/Inky.app`
- `src-tauri/target/release/bundle/dmg/Inky_<version>_aarch64.dmg`

A local build is signed ad hoc, not with an Apple Developer ID. Another Mac
refuses it until **right-click → Open** or `xattr -cr /Applications/Inky.app`.
The builds that people download come from CI, signed and notarized.

To use the running app from Claude Code sessions in this repo, `.mcp.json`
reads the token from an environment variable:

```sh
export INKY_MCP_TOKEN=<token from the Connect an agent window>
```

## Releasing

People download Inky from <https://inky.ascending.ai> (the site in `web/`).
The updater reads the feed on the download host
(`https://inky-downloads.ascending.ai/app/latest.json`, the updater endpoint
in `src-tauri/tauri.conf.json`). Shipping an update:

1. Merge to `main` and push.
2. Run `git tag v<version> main && git push origin v<version>`. CI
   (`.github/workflows/release.yml`) builds the app with that version for
   macOS (signed with the team's Developer ID and notarized by Apple) and for
   Windows (an installer, tried on a Windows runner first), and publishes both
   to the download host and as a GitHub release. Do not bump `version` in
   `tauri.conf.json`: the tag is the version.
3. Existing installs pick the update up on their next launch. The site shows
   the new version without a deploy.

The details, the repository settings and what to do when a run fails:

- [`docs/ops/desktop-release.md`](docs/ops/desktop-release.md): the release.
- [`docs/ops/web-deploy.md`](docs/ops/web-deploy.md): the site, deployed to
  Cloudflare Workers on a push to `main` that changes `web/`.
- [`infra/cloudflare`](infra/cloudflare/README.md) and
  [`infra/github`](infra/github/README.md): the download host (an R2 bucket)
  and the repository settings, set up once with OpenTofu.

Updates are signed with the update key (`~/.tauri/inky.key`, mirrored in the
repo's `TAURI_SIGNING_PRIVATE_KEY` Actions secret). **Back that file up:**
without it you can't ship updates to existing installs.
