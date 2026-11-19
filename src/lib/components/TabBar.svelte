<script lang="ts">
  import { tick } from "svelte";
  import { app } from "$lib/state.svelte";
  import { dragShift, dragTarget } from "$lib/tabs";
  import X from "@lucide/svelte/icons/x";

  let row: HTMLDivElement | undefined = $state();
  // Pointer-driven reordering: the tab follows the pointer and its neighbours
  // slide aside as it passes them; the new order is committed on release.
  const THRESHOLD = 4;
  const EDGE = 32;
  const SCROLL_STEP = 8;
  interface Drag {
    id: string;
    el: HTMLElement;
    from: number;
    pointer: number;
    startX: number;
    startScroll: number;
    lastX: number;
    widths: number[];
    offset: number;
    target: number;
    active: boolean;
  }
  let drag: Drag | null = $state(null);
  // True for one frame after a drop, so the reordered tabs snap into place
  // instead of animating back from their slid-aside positions.
  let settling = $state(false);
  let swallowClick = false;
  let scrollFrame = 0;

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

  function shiftOf(index: number, id: string): number {
    if (!drag?.active) return 0;
    if (id === drag.id) return drag.offset;
    return dragShift(index, drag.from, drag.target, drag.widths[drag.from]);
  }

  function update(d: Drag) {
    const starts = d.widths.reduce<number[]>((acc, _w, i) => {
      acc.push(i === 0 ? 0 : acc[i - 1] + d.widths[i - 1]);
      return acc;
    }, []);
    const total = d.widths.reduce((sum, w) => sum + w, 0);
    const raw = d.lastX - d.startX + ((row?.scrollLeft ?? 0) - d.startScroll);
    const min = -starts[d.from];
    const max = total - starts[d.from] - d.widths[d.from];
    d.offset = Math.max(min, Math.min(max, raw));
    d.target = dragTarget(d.widths, d.from, d.offset);
  }

  function autoScroll() {
    const d = drag;
    if (!d?.active || !row) return;
    const rect = row.getBoundingClientRect();
    const step =
      d.lastX < rect.left + EDGE ? -SCROLL_STEP : d.lastX > rect.right - EDGE ? SCROLL_STEP : 0;
    if (step) {
      const before = row.scrollLeft;
      row.scrollLeft += step;
      if (row.scrollLeft !== before) update(d);
    }
    scrollFrame = requestAnimationFrame(autoScroll);
  }

  function onpointerdown(e: PointerEvent, id: string) {
    swallowClick = false;
    if (e.button !== 0 || (e.target as HTMLElement).closest("button") || !row) return;
    const tabs = [...row.querySelectorAll<HTMLElement>("[data-tab-id]")];
    drag = {
      id,
      el: e.currentTarget as HTMLElement,
      from: app.tabs.findIndex((t) => t.id === id),
      pointer: e.pointerId,
      startX: e.clientX,
      startScroll: row.scrollLeft,
      lastX: e.clientX,
      widths: tabs.map((el) => el.getBoundingClientRect().width),
      offset: 0,
      target: 0,
      active: false,
    };
    drag.target = drag.from;
  }

  function onpointermove(e: PointerEvent) {
    const d = drag;
    if (!d || e.pointerId !== d.pointer) return;
    d.lastX = e.clientX;
    if (!d.active) {
      if (Math.abs(e.clientX - d.startX) < THRESHOLD) return;
      d.active = true;
      d.el.setPointerCapture(e.pointerId);
      scrollFrame = requestAnimationFrame(autoScroll);
    }
    update(d);
  }

  function finish(commit: boolean) {
    const d = drag;
    cancelAnimationFrame(scrollFrame);
    drag = null;
    if (!d?.active) return;
    swallowClick = true;
    if (commit && d.target !== d.from) {
      settling = true;
      app.moveTab(d.id, d.target);
      requestAnimationFrame(() => requestAnimationFrame(() => (settling = false)));
    }
  }

  function onwindowkeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && drag?.active) {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    }
  }
</script>

<svelte:window onkeydowncapture={onwindowkeydown} />

<div
  bind:this={row}
  class="tab-strip no-print shrink-0"
  role="tablist"
>
  {#each app.tabs as tab, index (tab.id)}
    {@const active = tab.id === app.activeTabId}
    {@const dragging = drag?.active && drag.id === tab.id}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      role="tab"
      tabindex="0"
      aria-selected={active}
      data-tab-id={tab.id}
      title={tab.path}
      style:transform={drag?.active ? `translateX(${shiftOf(index, tab.id)}px)` : undefined}
      data-dragging={dragging || undefined}
      class="tab cursor-default select-none
        {settling || dragging ? '' : 'transition-transform duration-150 ease-out'}"
      onclick={() => {
        if (swallowClick) {
          swallowClick = false;
          return;
        }
        app.activateTab(tab.id);
      }}
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
      onpointerdown={(e) => onpointerdown(e, tab.id)}
      onpointermove={onpointermove}
      onpointerup={() => finish(true)}
      onpointercancel={() => finish(false)}
      onlostpointercapture={() => drag?.active && finish(true)}
    >
      <span class="tab-sep" aria-hidden="true"></span>
      <div class="tab-inner">
        <span class="min-w-0 flex-1 truncate">{title(tab.path)}</span>
        {#if active && app.dirty}
          <span class="size-1.5 shrink-0 rounded-full bg-muted-foreground" aria-label="Unsaved changes"
          ></span>
        {/if}
        <button
          class="tab-close"
          aria-label="Close tab"
          onclick={(e) => {
            e.stopPropagation();
            app.closeTab(tab.id);
          }}
        >
          <X class="size-3" />
        </button>
      </div>
    </div>
  {/each}
</div>
