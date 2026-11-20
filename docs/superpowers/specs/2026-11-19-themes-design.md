# Themes: colour themes you can create, save and share

## Intent

Inky ships three looks today: Light, Dark and Book. The user wants to adjust
the look *exactly* as they like: pick colours with a visual editor, see the
result on a sample document as they go, save it under a name, and switch to it
like any built-in theme. Inky should also ship a few dozen ready-made themes,
so most people find something they like without opening the editor.

A theme is about **colour only**. Typography (typeface, line spacing,
paragraph spacing, justified text, text size, text width) is already a
separate Reading setting and stays independent: any typography works with any
theme.

## Goals

- Any number of themes, each one JSON file.
- A visual theme editor: controls on the left, a live sample document on the
  right, Save with a name.
- **Custom**: a theme that always holds the latest unsaved tweak. It is applied
  as you edit, survives relaunch, and is replaced by your next tweak.
- Light, Dark and Book stay, and look exactly as they do today (colours).
- A few dozen ready-made themes ship with the app.
- Themes can be imported and exported as files, to share them.

## Non-goals

- Typography in themes. Fonts, sizes and spacing stay in Reading settings.
- Recolouring code blocks. They keep their terminal look (fixed dark palette)
  in every theme, as decided for code blocks.
- Recolouring highlighter pens. The six pen colours carry meaning (they are
  named in exports and chosen by the reader), so they stay fixed; only how
  they blend follows the theme's kind (light or dark), as today.
- Themes for the PDF/print output beyond what printing already does today.
- Agents creating or switching themes over MCP. Not requested; can come later.
- A theme marketplace or online gallery.

## Anti-goals

- A theme that makes the app unreadable with no way back. The editor warns
  about low contrast, and Reset / picking another theme always works.
- Losing work: an unsaved tweak is never silently thrown away (it lives in
  Custom until the next tweak replaces it).
- Saved themes living in the document library, where deleting or moving
  documents could take them with it.
- The three built-in themes changing appearance because of this work.

## What a theme is

A theme has:

- an **id**: a stable slug assigned when the theme is created (built-ins are
  `light`, `dark`, `book`; Custom is `custom`). It never changes on rename,
  names the file (`<id>.json`), and is what Inky stores as the active theme;
- a **name**;
- a **kind**: `light` or `dark`. The kind drives everything a colour list
  cannot: the system `color-scheme` (scrollbars, form controls), the toast
  style, how highlighter pens blend, the editor's default syntax colours, and
  the Mermaid diagram base;
- **five main colours**: Page, Text, Accent & links, Sidebar, Lines & borders;
- **optional exact colours**, each derived from the main five when absent.

Derivation is what makes a theme coherent when only the main colours are set:
changing Page alone still gives matching hover shades, table headers, the tab
strip, inline code background and so on.

### File format

One JSON file per theme. Version field for future changes.

```json
{
  "inkyTheme": 1,
  "id": "fjord",
  "name": "Fjord",
  "kind": "dark",
  "colors": {
    "page": "#2e3440",
    "text": "#e5e9f0",
    "accent": "#88c0d0",
    "sidebar": "#3b4252",
    "border": "#434c5e",

    "mutedText": "#9aa3b2",
    "hover": "#3b4252",
    "inlineCode": "#3b4252",
    "quoteBar": "#4c566a",
    "tableHeader": "#343a46",
    "selection": "#88c0d055",
    "commentMark": "#ebcb8b",
    "tabStrip": "#2a2f3a"
  },
  "syntax": {
    "comment": "#7b8494", "keyword": "#81a1c1", "string": "#a3be8c",
    "title": "#88c0d0", "number": "#b48ead", "attr": "#8fbcbb"
  }
}
```

- `colors.page`, `text`, `accent`, `sidebar`, `border` are required. Every
  other colour is optional.
- `ui` is an optional group holding the remaining app colours one to one
  with today's custom properties that the main and exact colours don't cover
  (`card`, `popover`, `primary`, `secondary`, `destructive`, `input`, `ring`,
  `sidebarText`, `sidebarBorder`, and their foreground pairs). JSON-only, not
  in the editor UI; derived when absent. *(My call.)* This lets every theme,
  built-ins included, go through one model and one apply path, and makes
  exporting a built-in faithful.
- `syntax` (the writing-mode editor's Markdown syntax colours) is optional and
  JSON-only: not shown in the editor UI. When absent, the kind's default set is
  used.
- Colour values are any CSS colour string the webview accepts (hex, `rgb()`,
  `oklch()`…), validated with `CSS.supports("color", v)`. The editor writes
  `#rrggbb` (or `#rrggbbaa` where transparency matters, such as selection).
  The built-in themes keep their current `oklch()` values so they render
  exactly as today.
- A file that is not valid JSON, has an unknown `inkyTheme` version, a bad
  `kind`, or is missing a required colour is rejected with a message naming
  the problem. Unknown keys are ignored; an invalid optional colour is
  dropped (falls back to derived) with a warning.

### Mapping to today's styles

Inky's look is already driven by CSS custom properties on the root element
(`--background`, `--foreground`, `--muted`, `--sidebar`, `--prose-link`,
`--prose-code-bg`, `--hl-*`, `--editor-selection`, …). Applying a theme means
setting those properties from the theme's colours (explicit or derived) and
setting the kind class (`light`/`dark`) for the rules that branch on it
(`.dark …` selectors, the `dark` Tailwind variant). *(My call.)* There is one
model: Light, Dark and Book become theme objects like any other, specifying
every colour (main, exact, `ui`, `syntax`) with today's values, and the
`.dark`/`.book` colour blocks in `app.css` go away in favour of the single
apply path. The exact mapping from the theme keys to the existing custom
properties, and the derivation formulas, are left to the builder, with one
hard constraint: **Light, Dark and Book render exactly as they do today**.

Typography moves out of the theme layer: the `--prose-font`, `--prose-size`,
`--prose-leading`, `--prose-heading-font` values currently set by `.book` (and
the defaults in `:root`) stop being theme properties. Book becomes a colour
theme (its warm paper colours).

## Built-in and ready-made themes

- **Light, Dark, Book**: built in, listed first, read-only.
- **Ready-made themes**: about 24 at launch, roughly half light and half dark,
  read-only, bundled with the app (not files in the user's folder). Every one
  passes the contrast check below for body text and links on the page colour,
  and for sidebar text on the sidebar colour. *(My call.)* About half are
  well-known community palettes that people already like and whose licences
  allow reuse (for example Solarized Light/Dark, Nord, Gruvbox Light/Dark,
  Dracula, Catppuccin Latte/Mocha, Tokyo Night, Rosé Pine/Dawn, Everforest),
  adapted to Inky's colour roles and credited (name, author, licence) in a
  `THEME-CREDITS.md` shipped in the repo; each palette's licence is checked
  before inclusion and any that isn't clearly permissive is left out. The
  other half are Inky originals (paper, sepia, mint, slate, graphite, high
  contrast light and dark, and so on). No brand names of companies or
  products.
- Read-only themes can't be edited in place: editing one produces Custom, and
  "Save as…" turns that into a theme of your own.

## Your themes and Custom

- Saved themes are JSON files in a `themes/` folder inside Inky's own settings
  folder (Tauri `app_config_dir()`), never in the document library.
- **Custom** is one special theme, stored as `themes/custom.json`. It appears
  in the theme list only once you have tweaked something. Its file also
  records `basedOn`: the id of the theme the tweak started from. *(My call.)*
- Changing any colour in the editor immediately makes Custom the active theme,
  holding the theme you started from plus your change. The whole app (not only
  the sample) shows it right away.
- **Save** is shown when Custom's `basedOn` is one of *your* themes (also
  after a relaunch), and overwrites that theme with the current colours.
  Starting from Custom itself keeps its `basedOn`. **Save as…** asks for a name and creates a
  new theme. Either way the saved theme becomes active. Custom keeps its
  colours until the next tweak.
- Names are unique among your themes (case-insensitive); saving under an
  existing name asks before replacing it. Names of built-in or ready-made
  themes can't be reused.
- **Pinned and derived colours while editing** *(my call)*: the theme you
  start from shows exactly as it is, all of its colours included. As soon as
  you change a main colour, every optional colour you haven't set yourself in
  the editor re-derives from the main five, so the theme stays coherent
  (changing Page also updates hover, table header, tab strip…). Colours you
  set yourself under "More colours" stay pinned until you return them to
  auto. Custom stores only the main five plus the colours pinned that way.
- Your themes can be renamed, duplicated and deleted from the editor. Deleting
  the active theme switches to Light. Delete asks for confirmation.

## The theme editor

Approved sketch: `.superpowers/brainstorm/92292-1795085614/content/theme-editor.html`
(the colour pickers in it work).

- Opened from the theme menus ("Edit Themes…") and from Reading settings.
- A large dialog over the main window. Left: controls. Right: a live sample
  document. The app behind the dialog also shows the theme as you edit.
- **Controls, top to bottom:**
  - Theme name (the theme being edited; "Custom" once tweaked).
  - "Start from": every theme (built-in, ready-made, yours, Custom), with a
    small swatch of each theme's page/text/accent colours.
  - Kind: Light / Dark.
  - Main colours: Page, Text, Accent & links, Sidebar, Lines & borders. Each
    is a swatch that opens the colour picker, with the hex value beside it,
    editable as text.
  - "More colours", collapsed: every optional colour. A colour that is
    currently derived shows "auto"; setting it pins it; a small reset button
    returns it to auto.
  - Buttons: Reset (back to the theme you started from), Save (your themes
    only), Save as…
  - Import… and Export… (file dialogs). *(My call.)* **Import** validates
    the file and adds it to your themes (a new id; a name that clashes with
    any existing theme gets " 2", " 3"… appended), then makes it active.
    **Export** writes the theme currently shown in the editor, whichever kind
    it is (built-in, ready-made, yours or Custom), with every colour it
    specifies, under its name.
  - A Done button and the dialog's close button just close it. *(My call.)*
    Nothing is undone: whatever theme is active (Custom after a tweak) stays,
    as the user asked.
- Choosing a theme under "Start from" switches the app to it right away, the
  same as picking it from the theme menu, so the app and the editor never
  disagree. *(My call.)*
- **Sample document:** a miniature Inky (sidebar with a folder tree and a
  selected document, tab strip, document) with a heading, body text, a link, a
  highlight, a comment mark, inline code, a quote, a table and a code block, so
  every colour a theme touches is visible. It is fixed sample content, not the
  user's document.
- **Contrast check:** when body text on page, link on page, or sidebar text on
  sidebar falls below 4.5:1 (WCAG AA), a short warning appears next to the
  offending control. It warns; it never blocks saving.
- Colour picking uses the webview's native `<input type="color">` (the macOS
  colour panel), plus the hex text field.

## Choosing a theme

- **View → Theme** (native menu): Light, Dark, Book; then your themes; then
  Custom (when present); then a "Ready-made" submenu with the rest; then
  "Edit Themes…". The active theme is checked. The menu is rebuilt when the
  theme list changes.
- **Toolbar theme button**: the same list as a dropdown, with colour swatches,
  scrollable when long, and "Edit Themes…" at the bottom. Its icon follows the
  active theme's kind (sun for light, moon for dark; Book keeps its book icon).
- The active theme is remembered across relaunches. If a saved theme file has
  disappeared or become invalid, Inky falls back to Light and says so once.

## Migration

- `inky.theme` values `light` / `dark` / `book` keep working.
- Book users keep their serif look: if the stored theme is `book` and the
  stored typeface is the current "Theme" option, the typeface is set once to
  Iowan, which is the font Book uses today. The "Theme" typeface option is
  renamed "Default" (San Francisco). Book's slightly larger text and looser
  line height are not carried over; Reading settings cover those.

## Other things that follow the theme

- **Mermaid diagrams** use Mermaid's `base` theme with `themeVariables` taken
  from the theme's colours (page, text, accent, borders), so diagrams match
  any theme. The kind sets `darkMode`.
- **Toasts** follow the kind.
- **The tab strip, sidebar, dialogs, menus and popovers** follow the theme, as
  they do now through the shared custom properties.

## Plumbing *(my call)*

- Theme files are read and written by new Tauri commands in Rust (list,
  read, write, delete inside `themes/`), not the fs plugin, so no new
  filesystem permissions are needed and paths can't escape the folder.
- The frontend owns the theme list and pushes the menu's entries (id, name,
  group, checked) to Rust, which rebuilds the Theme submenu, the same way
  menu checks are pushed today. Inky has one main window, so no cross-window
  syncing is needed.

## Left to the builder

- The exact key-to-custom-property mapping and the derivation formulas (with
  the constraint that the three built-ins are unchanged).
- The exact palettes of the ~24 ready-made themes and the originals' names
  (each passes the contrast check).
- File naming inside `themes/` (a slug of the name is fine), and whether the
  folder is read once at launch or also when the editor opens.
- Dialog sizing, the swatch design, and keyboard behaviour in the editor.
- How contrast is computed (resolve any CSS colour to sRGB, e.g. via a
  canvas; alpha colours composited over the page colour).
- Whether the native menu's ready-made submenu is flat or split light/dark.
