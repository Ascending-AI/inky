<script lang="ts">
  import { writeText } from "@tauri-apps/plugin-clipboard-manager";
  import { toast } from "svelte-sonner";
  import { app } from "$lib/state.svelte";
  import {
    COLOR_KEYS,
    HIGHLIGHT_COLORS,
    highlightsToMarkdown,
    shownText,
    type Highlight,
    type HighlightColor,
  } from "$lib/highlights";
  import { Button } from "$lib/components/ui/button/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import Copy from "@lucide/svelte/icons/copy";
  import Trash2 from "@lucide/svelte/icons/trash-2";

  let scope = $state<"doc" | "all">("doc");
  let filter = $state<HighlightColor | null>(null);

  function title(path: string): string {
    return (path.split("/").pop() ?? path).replace(/\.(md|markdown)$/i, "");
  }

  function folder(path: string): string {
    const root = app.activeRoot;
    const dir = path.slice(0, path.lastIndexOf("/"));
    return dir.startsWith(root) ? dir.slice(root.length + 1) : dir;
  }

  /** This document's highlights in reading order (text that is gone sorts last). */
  const docList = $derived(
    [...app.docHighlights].sort(
      (a, b) =>
        (app.highlightOrder[a.id] ?? Number.MAX_SAFE_INTEGER) -
          (app.highlightOrder[b.id] ?? Number.MAX_SAFE_INTEGER) ||
        a.createdAt.localeCompare(b.createdAt),
    ),
  );

  /** Every document with highlights, newest documents first. */
  const groups = $derived.by(() => {
    if (scope === "doc") {
      return app.currentPath ? [{ path: app.currentPath, highlights: docList }] : [];
    }
    return Object.entries(app.highlightStore)
      .map(([path, highlights]) => ({
        path,
        highlights: path === app.currentPath ? docList : highlights,
      }))
      .sort((a, b) => title(a.path).localeCompare(title(b.path)));
  });

  const counts = $derived.by(() => {
    const c: Partial<Record<HighlightColor, number>> = {};
    for (const g of groups) for (const h of g.highlights) c[h.color] = (c[h.color] ?? 0) + 1;
    return c;
  });
  const total = $derived(Object.values(counts).reduce((a, b) => a + (b ?? 0), 0));

  const shown = $derived(
    groups
      .map((g) => ({ ...g, highlights: g.highlights.filter((h) => !filter || h.color === filter) }))
      .filter((g) => g.highlights.length > 0),
  );

  function isOrphan(path: string, h: Highlight): boolean {
    return path === app.currentPath && app.highlightOrder[h.id] === undefined;
  }

  async function copyMarkdown() {
    const md = highlightsToMarkdown(shown.map((g) => ({ title: title(g.path), highlights: g.highlights })));
    const n = shown.reduce((a, g) => a + g.highlights.length, 0);
    try {
      await writeText(md);
      toast.success(`Copied ${n} highlight${n === 1 ? "" : "s"} as Markdown`);
    } catch (e) {
      toast.error(`Could not copy: ${e}`);
    }
  }
</script>

<aside class="no-print flex h-full w-full flex-col border-l bg-background">
  <div class="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
    <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Highlights</span>
    <Button
      variant="ghost"
      size="icon"
      class="size-6"
      title="Copy as Markdown"
      disabled={shown.length === 0}
      onclick={copyMarkdown}
    >
      <Copy class="size-3.5" />
    </Button>
  </div>

  <div class="flex flex-col gap-2 px-3 pb-2">
    <div class="grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5">
      {#each [{ key: "doc", label: "This document" }, { key: "all", label: "All documents" }] as opt (opt.key)}
        <button
          class="rounded-[5px] py-1 text-xs transition-colors
            {scope === opt.key ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => (scope = opt.key as "doc" | "all")}
        >
          {opt.label}
        </button>
      {/each}
    </div>
    {#if total > 0}
      <div class="flex flex-wrap items-center gap-1">
        <button
          class="rounded-full border px-2 py-0.5 text-[11px] transition-colors
            {filter === null ? 'border-ring bg-secondary font-medium' : 'text-muted-foreground hover:bg-accent'}"
          onclick={() => (filter = null)}
        >
          All {total}
        </button>
        {#each COLOR_KEYS.filter((k) => counts[k]) as key (key)}
          <button
            class="flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] tabular-nums transition-colors
              {filter === key ? 'border-ring bg-secondary font-medium' : 'text-muted-foreground hover:bg-accent'}"
            title={HIGHLIGHT_COLORS[key].label}
            onclick={() => (filter = filter === key ? null : key)}
          >
            <span class="size-2.5 rounded-full border border-black/10" style="background: {HIGHLIGHT_COLORS[key].value}"
            ></span>
            {counts[key]}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <ScrollArea class="min-h-0 flex-1">
    <div class="flex flex-col gap-3 px-3 pb-4">
      {#each shown as group (group.path)}
        <div class="flex flex-col gap-1.5">
          {#if scope === "all"}
            <div class="min-w-0 pt-1">
              <p class="truncate text-xs font-semibold" title={group.path}>{title(group.path)}</p>
              {#if folder(group.path)}
                <p class="truncate text-[10px] text-muted-foreground">{folder(group.path)}</p>
              {/if}
            </div>
          {/if}
          {#each group.highlights as h (h.id)}
            {@const orphan = isOrphan(group.path, h)}
            <div class="group relative">
              <button
                class="w-full rounded-md border py-2 pr-7 pl-3 text-left transition-colors hover:bg-accent/60"
                style="border-left: 4px solid {HIGHLIGHT_COLORS[h.color].value}"
                onclick={() => app.revealHighlight(group.path, h.id)}
              >
                <p class="line-clamp-4 text-xs leading-snug {orphan ? 'text-muted-foreground line-through' : ''}">
                  {shownText(h)}
                </p>
                {#if h.note}
                  <p class="mt-1 line-clamp-3 text-[11px] leading-snug whitespace-pre-wrap text-muted-foreground">
                    {h.note}
                  </p>
                {/if}
                {#if orphan}
                  <p class="mt-1 text-[10px] text-muted-foreground">This text is no longer in the document</p>
                {/if}
              </button>
              <button
                class="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                title="Remove highlight"
                onclick={() => app.removeHighlight(h.id)}
              >
                <Trash2 class="size-3" />
              </button>
            </div>
          {/each}
        </div>
      {:else}
        <div class="px-1 pt-6 text-center text-xs leading-relaxed text-muted-foreground">
          {#if filter}
            No {HIGHLIGHT_COLORS[filter].label.toLowerCase()} highlights here.
          {:else if scope === "doc"}
            Select text in the reading view and pick a colour to highlight it. <br />
            <span class="text-[11px]">Press H to reuse the last colour.</span>
          {:else}
            No highlights yet.
          {/if}
        </div>
      {/each}
    </div>
  </ScrollArea>
</aside>
