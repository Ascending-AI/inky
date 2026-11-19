<script lang="ts">
  import { untrack } from "svelte";
  import { app } from "$lib/state.svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import NameDialog from "./NameDialog.svelte";
  import ColorRow from "./ColorRow.svelte";
  import ThemeSample from "./ThemeSample.svelte";
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { beginEdit, editedTheme, themeGroup, themeSections, type EditState } from "$lib/themes/library";
  import { deriveExact, EXACT_KEYS, MAIN_KEYS, resolveTheme, type ExactKey, type MainKey, type Theme } from "$lib/themes/model";
  import { resolveColorWith } from "$lib/themes/colors";
  import { contrastIssues, type ContrastKey } from "$lib/themes/contrast";

  const MAIN_LABELS: Record<MainKey, string> = {
    page: "Page",
    text: "Text",
    accent: "Accent & links",
    sidebar: "Sidebar",
    border: "Lines & borders",
  };
  const EXACT_LABELS: Record<ExactKey, string> = {
    mutedText: "Muted text",
    hover: "Hover",
    tableHeader: "Table header",
    inlineCode: "Inline code",
    quoteBar: "Quote bar",
    selection: "Selection",
    commentMark: "Comment mark",
    tabStrip: "Tab strip",
  };
  const KINDS: { kind: Theme["kind"]; label: string }[] = [
    { kind: "light", label: "Light" },
    { kind: "dark", label: "Dark" },
  ];
  /** Which main colour row carries each contrast warning. */
  const WARN_ROW: Record<ContrastKey, MainKey> = { text: "text", accent: "accent", sidebar: "sidebar" };

  /**
   * The edit in progress, replaced (never mutated) on every change. `changed`
   * says whether it has been applied yet, i.e. whether the app now shows Custom.
   */
  let edit = $state.raw<EditState | null>(null);
  let changed = $state(false);
  let frame = 0;

  function begin(t: Theme) {
    cancelAnimationFrame(frame);
    frame = 0;
    edit = beginEdit(t);
    changed = false;
  }

  // Start from the active theme on open, and follow the app when its theme
  // changes underneath the editor (menu, Save as…, Import…, Delete…).
  $effect(() => {
    const open = app.themeEditorVisible;
    const active = app.activeTheme;
    untrack(() => {
      if (!open) {
        flush();
        edit = null;
      } else if (!edit || (changed ? active.id !== "custom" : active !== edit.start)) begin(active);
    });
  });

  /** The theme the editor shows: the start theme until the first change, then Custom. */
  const current = $derived(edit ? (changed ? editedTheme(edit) : edit.start) : app.activeTheme);
  const props = $derived(resolveTheme(current));
  const derivedExact = $derived(deriveExact(current));
  const resolve = (css: string) => resolveColorWith(css, props);
  const warnings = $derived(
    Object.fromEntries(
      contrastIssues(current, resolve).map((i) => [
        WARN_ROW[i.key],
        `Low contrast ${(Math.floor(i.ratio * 10) / 10).toFixed(1)}:1`,
      ]),
    ) as Partial<Record<MainKey, string>>,
  );

  const yours = $derived(themeGroup(current.id) === "yours");
  /** Save overwrites the theme of yours that Custom started from. */
  const saveTarget = $derived(
    current.id === "custom" && app.customBasedOn && themeGroup(app.customBasedOn) === "yours"
      ? app.themes.find((t) => t.id === app.customBasedOn)
      : undefined,
  );
  const basedOnName = $derived(
    current.id === "custom" ? app.themes.find((t) => t.id === app.customBasedOn)?.name : undefined,
  );

  // Picker input arrives many times a second; the app follows once per frame.
  function change(next: EditState) {
    edit = next;
    changed = true;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (edit && changed) app.applyEdit(edit);
    });
  }

  function setMain(k: MainKey, hex: string) {
    if (edit) change({ ...edit, mains: { ...edit.mains, [k]: hex }, mainsTouched: true });
  }
  function setKind(kind: Theme["kind"]) {
    if (edit && kind !== current.kind) change({ ...edit, kind, mainsTouched: true });
  }
  function pin(k: ExactKey, hex: string) {
    if (edit) change({ ...edit, pinned: { ...edit.pinned, [k]: hex } });
  }
  function unpin(k: ExactKey) {
    if (!edit) return;
    const pinned = { ...edit.pinned };
    delete pinned[k];
    change({ ...edit, pinned });
  }

  function startFrom(id: string) {
    app.setTheme(id);
    begin(app.activeTheme);
  }

  /** Back to the theme the edit started from. Custom as a start is written back as it was. */
  function reset() {
    if (!edit) return;
    const start = edit.start;
    if (start.id === "custom") {
      app.applyEdit(beginEdit(start));
      begin(app.activeTheme);
    } else {
      startFrom(start.id);
    }
  }

  let saveAsOpen = $state(false);
  let renameOpen = $state(false);
  let deleteOpen = $state(false);

  /** Apply a change still waiting for its frame, so saving sees it. */
  function flush() {
    if (!frame) return;
    cancelAnimationFrame(frame);
    frame = 0;
    if (edit && changed) app.applyEdit(edit);
  }
</script>

<Dialog.Root bind:open={app.themeEditorVisible}>
  <Dialog.Content class="flex h-[640px] max-h-[calc(100vh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[960px]">
    <div class="flex w-[300px] shrink-0 flex-col border-r">
      <ScrollArea class="min-h-0 flex-1">
        <div class="grid gap-5 p-4">
          <section class="grid gap-1.5">
            <Dialog.Title class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Theme</Dialog.Title>
            <p class="truncate text-base font-semibold" title={current.name}>{current.name}</p>
            {#if basedOnName}
              <p class="-mt-1 text-xs text-muted-foreground">Based on {basedOnName}</p>
            {/if}
            {#if yours}
              <div class="flex gap-1">
                <Button variant="outline" size="xs" onclick={() => (renameOpen = true)}>Rename…</Button>
                <Button variant="outline" size="xs" onclick={() => app.duplicateTheme(current.id)}>
                  Duplicate
                </Button>
                <Button variant="destructive" size="xs" onclick={() => (deleteOpen = true)}>Delete…</Button>
              </div>
            {/if}
          </section>

          <section class="grid gap-1.5">
            <h3 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Start from</h3>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                {#snippet child({ props: p })}
                  <Button {...p} variant="outline" class="w-full justify-between font-normal">
                    {@render swatches(edit?.start ?? current)}
                    <span class="min-w-0 flex-1 truncate text-left">{(edit?.start ?? current).name}</span>
                    <ChevronDown class="size-4 opacity-60" />
                  </Button>
                {/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="start" class="max-h-[60vh] w-[268px] overflow-y-auto">
                {#each themeSections(app.themes) as sec, i (sec.label)}
                  {#if i > 0}<DropdownMenu.Separator />{/if}
                  <DropdownMenu.Label class="text-xs text-muted-foreground">{sec.label}</DropdownMenu.Label>
                  {#each sec.items as t (t.id)}
                    <DropdownMenu.Item onclick={() => startFrom(t.id)}>
                      {@render swatches(t)}
                      <span class="flex-1 truncate">{t.name}</span>
                      {#if t.id === edit?.start.id}<Check class="size-4" />{/if}
                    </DropdownMenu.Item>
                  {/each}
                {/each}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </section>

          <section class="grid gap-1.5">
            <h3 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Kind</h3>
            <div class="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Kind">
              {#each KINDS as k (k.kind)}
                <button
                  role="radio"
                  aria-checked={current.kind === k.kind}
                  class="rounded-md py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50
                    {current.kind === k.kind
                    ? 'bg-background font-semibold text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'}"
                  onclick={() => setKind(k.kind)}
                >
                  {k.label}
                </button>
              {/each}
            </div>
          </section>

          <section class="grid">
            <h3 class="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Main colours</h3>
            {#each MAIN_KEYS as k (k)}
              <ColorRow
                label={MAIN_LABELS[k]}
                value={resolve(current.colors[k])}
                warning={warnings[k]}
                onpick={(hex) => setMain(k, hex)}
              />
            {/each}
          </section>

          <details class="group">
            <summary
              class="flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden"
            >
              <ChevronRight class="size-3.5 transition-transform group-open:rotate-90" />
              More colours (every shade, for exact control)
            </summary>
            <div class="mt-1 grid">
              {#each EXACT_KEYS as k (k)}
                {@const own = current.colors[k]}
                <ColorRow
                  label={EXACT_LABELS[k]}
                  value={resolve(own ?? derivedExact[k])}
                  auto={own === undefined}
                  onpick={(hex) => pin(k, hex)}
                  onreset={edit && k in edit.pinned ? () => unpin(k) : undefined}
                />
              {/each}
            </div>
          </details>

          <section class="grid gap-2">
            <div class="flex gap-2">
              <Button variant="outline" size="sm" class="flex-1" disabled={!changed} onclick={reset}>Reset</Button>
              {#if saveTarget}
                <Button
                  size="sm"
                  class="flex-1"
                  title="Overwrite {saveTarget.name}"
                  onclick={() => {
                    flush();
                    app.saveTheme();
                  }}
                >
                  Save
                </Button>
              {/if}
              <Button
                variant={saveTarget ? "outline" : "default"}
                size="sm"
                class="flex-1"
                onclick={() => {
                  flush();
                  saveAsOpen = true;
                }}
              >
                Save as…
              </Button>
            </div>
            <div class="flex gap-2">
              <Button variant="ghost" size="sm" class="flex-1" onclick={() => app.importTheme()}>Import…</Button>
              <Button variant="ghost" size="sm" class="flex-1" onclick={() => app.exportTheme(current)}>
                Export…
              </Button>
            </div>
            <p class="text-[11px] text-muted-foreground">
              Unsaved changes live in “Custom”, which stays applied until your next tweak.
            </p>
          </section>
        </div>
      </ScrollArea>
      <div class="flex justify-end border-t p-3">
        <Button size="sm" onclick={() => (app.themeEditorVisible = false)}>Done</Button>
      </div>
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-3 bg-muted/40 p-4">
      <p class="flex h-8 items-center text-xs font-medium tracking-wide text-muted-foreground uppercase">Sample</p>
      <div class="min-h-0 flex-1">
        <ThemeSample theme={current} />
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>

{#snippet swatches(t: Theme)}
  <span class="flex shrink-0 gap-0.5">
    {#each [t.colors.page, t.colors.text, t.colors.accent] as c, i (i)}
      <span class="size-2.5 rounded-full border border-black/15" style="background:{c}"></span>
    {/each}
  </span>
{/snippet}

<NameDialog
  open={saveAsOpen}
  title="Save theme as"
  label="Theme name"
  initial={current.id === "custom" ? "" : current.name}
  action="Save"
  onsubmit={(name) => {
    saveAsOpen = false;
    app.saveThemeAs(name);
  }}
  oncancel={() => (saveAsOpen = false)}
/>

<NameDialog
  open={renameOpen}
  title="Rename theme"
  label="Theme name"
  initial={current.name}
  action="Rename"
  onsubmit={(name) => {
    renameOpen = false;
    app.renameTheme(current.id, name);
  }}
  oncancel={() => (renameOpen = false)}
/>

<AlertDialog.Root open={deleteOpen} onOpenChange={(o) => !o && (deleteOpen = false)}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Delete “{current.name}”?</AlertDialog.Title>
      <AlertDialog.Description>
        The theme is removed for good.{app.themeId === current.id ? " Inky switches to Light." : ""}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action
        onclick={() => {
          deleteOpen = false;
          app.deleteTheme(current.id);
        }}
      >
        Delete
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
