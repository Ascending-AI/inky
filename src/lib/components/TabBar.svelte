<script lang="ts">
  import { tick } from "svelte";
  import { app } from "$lib/state.svelte";
  import X from "@lucide/svelte/icons/x";

  const DRAG_TYPE = "application/x-inky-tab";

  let row: HTMLDivElement | undefined = $state();
  let dragId: string | null = $state(null);
  let overId: string | null = $state(null);

  function title(path: string) {
    const name = path.split("/").pop() ?? path;
    return name.replace(/\.(md|markdown|mmd)$/i, "");
  }

  $effect(() => {
    const id = app.activeTabId;
    tick().then(() => {
      row
        ?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(id ?? "")}"]`)
        ?.scrollIntoView({ inline: "nearest", block: "nearest" });
    });
  });

  function ondragstart(e: DragEvent, id: string) {
    dragId = id;
    e.dataTransfer?.setData(DRAG_TYPE, id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  }

  function ondragover(e: DragEvent, id: string) {
    if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    overId = id;
  }

  function ondrop(e: DragEvent, id: string) {
    const src = e.dataTransfer?.getData(DRAG_TYPE);
    dragId = overId = null;
    if (!src || src === id) return;
    e.preventDefault();
    const to = app.tabs.findIndex((t) => t.id === id);
    if (to >= 0) app.moveTab(src, to);
  }
</script>

<div
  bind:this={row}
  class="no-print flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-muted/40 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  role="tablist"
>
  {#each app.tabs as tab (tab.id)}
    {@const active = tab.id === app.activeTabId}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      role="tab"
      tabindex="0"
      aria-selected={active}
      data-tab-id={tab.id}
      title={tab.path}
      draggable="true"
      class="group flex min-w-[120px] max-w-[220px] flex-1 cursor-default items-center gap-1.5 border-r border-border px-3 text-sm transition-colors
        {active ? 'bg-background text-foreground' : 'text-muted-foreground hover:bg-muted'}
        {overId === tab.id && dragId !== tab.id ? 'ring-2 ring-inset ring-ring/60' : ''}
        {dragId === tab.id ? 'opacity-50' : ''}"
      onclick={() => app.activateTab(tab.id)}
      onauxclick={(e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        app.closeTab(tab.id);
      }}
      onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          app.activateTab(tab.id);
        }
      }}
      ondragstart={(e) => ondragstart(e, tab.id)}
      ondragover={(e) => ondragover(e, tab.id)}
      ondragleave={() => (overId = null)}
      ondrop={(e) => ondrop(e, tab.id)}
      ondragend={() => (dragId = overId = null)}
    >
      <span class="min-w-0 flex-1 truncate">{title(tab.path)}</span>
      {#if active && app.dirty}
        <span class="size-1.5 shrink-0 rounded-full bg-muted-foreground" aria-label="Unsaved changes"
        ></span>
      {/if}
      <button
        class="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground
          {active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}"
        aria-label="Close tab"
        onclick={(e) => {
          e.stopPropagation();
          app.closeTab(tab.id);
        }}
      >
        <X class="size-3" />
      </button>
    </div>
  {/each}
</div>
