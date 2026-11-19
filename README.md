# Inky 🖋️

A small, pleasant macOS app for reading and writing Markdown. It's built for long
documents (including the long research reports AI agents write) and lets those
agents work in your library directly through a built-in MCP server.

![Inky](src-tauri/icons/128x128.png)

Your documents stay plain `.md` files in a folder you choose. There's no
database, no account, and nothing leaves your Mac.

- [Install](#install)
- [Features](#features)
- [Connect an agent (MCP)](#connect-an-agent-mcp)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Files Inky keeps](#files-inky-keeps)
- [Development](#development)
- [Releasing](#releasing)

## Install

Download the latest `Inky_<version>_aarch64.dmg` from
[Releases](https://github.com/Ascending-AI/inky/releases) and drag Inky into
Applications. It needs an Apple-silicon Mac.

The app is signed for updates but not notarized by Apple, so the first launch
needs **right-click → Open**, or:

```sh
xattr -cr /Applications/Inky.app
```

Inky checks for updates on launch and from **Inky → Check for Updates…**.

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
  background tab. The tab bar appears once two are open, and tabs are
  restored on relaunch.
- **Breadcrumbs** in the toolbar show the folder path; each crumb lists that
  folder's documents.
- **Paste as document** (⌘⇧V) turns copied Markdown into a new document.
  Pasted Mermaid source becomes a diagram.
- **Images** in the library appear in the sidebar and open in a viewer.
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
- **Themes**: Light, Dark (anthracite, not black) and Book (warm paper and
  serif type).

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
folder, recent files, MCP token), `highlights.json`, and `read-baselines/` (the
"last read" copies behind *What changed*).

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
| `make check` | Type-check the frontend and Rust, run the Rust tests (`pnpm test` runs the frontend tests) |
| `make dmg` | Build the signed `.app`, `.dmg` and updater artifacts |
| `make release` | `make dmg`, then assemble `dist/release/` for a GitHub release (with `latest.json`) |
| `make icons` | Regenerate all app icons from `assets/icon.svg` |
| `make open` | Open the last built app |
| `make mcp` | Run the MCP server on stdio (dev build) |
| `make clean` | Remove build outputs |

Builds are signed with `~/.tauri/inky.key` (override with `make dmg KEY=…`).
Plain `pnpm tauri build` fails without it; `pnpm bundle` is an alias for
`make dmg`.

To use the running app from Claude Code sessions in this repo, `.mcp.json`
reads the token from an environment variable:

```sh
export INKY_MCP_TOKEN=<token from the Connect an agent window>
```

## Releasing

1. Bump `version` in `src-tauri/tauri.conf.json` and commit.
2. Run `git tag v<version> && git push --tags`. CI
   (`.github/workflows/release.yml`) builds, signs and publishes the release
   with its `latest.json` update feed. (`make release` does the same
   locally.)
3. Existing installs pick the update up on their next launch.

The updater reads `latest.json` from the latest release of
`Ascending-AI/inky`. Updates are signed with `~/.tauri/inky.key`, which is
mirrored in the repo's `TAURI_SIGNING_PRIVATE_KEY` Actions secret. **Back that
file up:** without it you can't ship updates to existing installs.
