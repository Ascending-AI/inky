<script lang="ts">
  import { tick } from "svelte";
  import { fade } from "svelte/transition";
  import { app } from "$lib/state.svelte";
  import { COLOR_KEYS, HIGHLIGHT_COLORS, type Highlight } from "$lib/highlights";
  import StickyNote from "@lucide/svelte/icons/sticky-note";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Check from "@lucide/svelte/icons/check";

  interface Props {
    highlight: Highlight;
    x: number;
    y: number;
    onclose: () => void;
  }
  let { highlight, x, y, onclose }: Props = $props();

  // svelte-ignore state_referenced_locally -- the note box opens on the stored note once
  let editingNote = $state(highlight.note.length > 0);
  // svelte-ignore state_referenced_locally
  let note = $state(highlight.note);
  let box: HTMLTextAreaElement | undefined = $state();

  function openNote() {
    editingNote = true;
    tick().then(() => box?.focus());
  }

  function saveNote() {
    if (note !== highlight.note) app.updateHighlight(highlight.id, { note: note.trim() });
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="highlight-popover no-print absolute z-30 w-64 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg"
  style="left: {x}px; top: {y}px"
  transition:fade={{ duration: 100 }}
  onclick={(e) => e.stopPropagation()}
  onmousedown={(e) => e.stopPropagation()}
>
  <div class="flex items-center gap-1">
    {#each COLOR_KEYS as key (key)}
      <button
        class="flex size-6 items-center justify-center rounded-full border border-black/10 transition-transform hover:scale-110"
        style="background: {HIGHLIGHT_COLORS[key].value}"
        title={HIGHLIGHT_COLORS[key].label}
        aria-pressed={highlight.color === key}
        onclick={() => app.updateHighlight(highlight.id, { color: key })}
      >
        {#if highlight.color === key}<Check class="size-3.5 text-black/70" />{/if}
      </button>
    {/each}
    <div class="ml-auto flex items-center">
      {#if !editingNote}
        <button
          class="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Add a note"
          onclick={openNote}
        >
          <StickyNote class="size-3.5" />
        </button>
      {/if}
      <button
        class="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
        title="Remove highlight"
        onclick={() => {
          onclose();
          app.removeHighlight(highlight.id);
        }}
      >
        <Trash2 class="size-3.5" />
      </button>
    </div>
  </div>
  {#if editingNote}
    <textarea
      bind:this={box}
      bind:value={note}
      rows="3"
      placeholder="Note…"
      class="mt-2 w-full resize-none rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
      onblur={saveNote}
      onkeydown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          note = highlight.note;
          onclose();
        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          saveNote();
          onclose();
        }
      }}
    ></textarea>
    <p class="mt-1 text-[10px] text-muted-foreground">Saved when you click away · ⌘↩ to close</p>
  {/if}
</div>
