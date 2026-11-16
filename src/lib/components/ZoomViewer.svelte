<script lang="ts" module>
  /** One zoomable thing: an image (by URL) or an inline SVG diagram. */
  export type MediaItem =
    | { kind: "img"; src: string; title: string }
    | { kind: "svg"; svg: string; title: string };
</script>

<script lang="ts">
  import { onMount, tick, untrack, type Snippet } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ZoomIn from "@lucide/svelte/icons/zoom-in";
  import ZoomOut from "@lucide/svelte/icons/zoom-out";
  import X from "@lucide/svelte/icons/x";
  import {
    ZOOM_STEP,
    clampView,
    fitScale,
    fitView,
    wheelFactor,
    zoomTo,
    type Size,
    type View,
  } from "$lib/zoomview";

  interface Props {
    items: MediaItem[];
    index: number;
    onindex: (i: number) => void;
    onclose: () => void;
    /** Extra header buttons (e.g. open in Finder for library images). */
    actions?: Snippet;
  }
  let { items, index, onindex, onclose, actions }: Props = $props();

  const item = $derived(items[index]);
  const vector = $derived(item?.kind === "svg" || (item?.kind === "img" && /\.svg($|\?)/i.test(item.src)));

  let stage: HTMLDivElement | undefined = $state();
  let svgHost: HTMLDivElement | undefined = $state();
  let stageSize = $state<Size>({ w: 0, h: 0 });
  let natural = $state<Size | null>(null);
  let view = $state<View>({ scale: 1, x: 0, y: 0 });
  /** Still showing the whole thing: re-fit when the window resizes. */
  let fitted = $state(true);
  let failed = $state(false);
  let dragging = $state(false);

  const fit = $derived(natural ? fitScale(natural, stageSize, vector) : 1);

  // A new item: forget the old size and wait for this one's.
  $effect(() => {
    void item;
    natural = null;
    failed = false;
    fitted = true;
    if (item?.kind === "svg") tick().then(measureSvg);
  });

  function measureSvg() {
    const svg = svgHost?.querySelector("svg");
    if (!svg) return;
    const vb = svg.viewBox?.baseVal;
    let w = vb && vb.width ? vb.width : 0;
    let h = vb && vb.height ? vb.height : 0;
    if (!w || !h) {
      const r = svg.getBoundingClientRect();
      w = r.width || 800;
      h = r.height || 600;
    }
    // Let the wrapper's size drive the drawing (Mermaid caps max-width).
    svg.removeAttribute("style");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    natural = { w, h };
  }

  function onImgLoad(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    natural = { w: img.naturalWidth || 800, h: img.naturalHeight || 600 };
  }

  // Fit once the size is known, and again on resize while still fitted.
  // Only size changes drive this; the view is read untracked, since this
  // effect writes it (zooming and panning must not re-run it).
  $effect(() => {
    const content = natural;
    const room = { w: stageSize.w, h: stageSize.h };
    const isVector = vector;
    if (!content || !room.w || !room.h) return;
    untrack(() => {
      view = fitted ? fitView(content, room, isVector) : clampView(view, content, room);
    });
  });

  function center() {
    return { x: stageSize.w / 2, y: stageSize.h / 2 };
  }

  function zoom(scale: number, at = center()) {
    if (!natural) return;
    view = zoomTo(view, scale, at, natural, stageSize, vector);
    fitted = false;
  }

  function showFit() {
    if (!natural) return;
    fitted = true;
    view = fitView(natural, stageSize, vector);
  }

  function showActualSize() {
    zoom(1);
  }

  function step(delta: number) {
    if (items.length < 2) return;
    onindex((index + delta + items.length) % items.length);
  }

  function localPoint(e: { clientX: number; clientY: number }) {
    const r = stage!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // --- pointer: drag to pan, double-click to toggle zoom ----------------------
  let dragFrom: { px: number; py: number; x: number; y: number } | null = null;

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || !natural) return;
    dragFrom = { px: e.clientX, py: e.clientY, x: view.x, y: view.y };
    dragging = true;
    stage?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragFrom || !natural) return;
    view = clampView(
      { scale: view.scale, x: dragFrom.x + e.clientX - dragFrom.px, y: dragFrom.y + e.clientY - dragFrom.py },
      natural,
      stageSize,
    );
  }

  function onPointerUp(e: PointerEvent) {
    dragFrom = null;
    dragging = false;
    if (stage?.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
  }

  function onDoubleClick(e: MouseEvent) {
    if (!natural) return;
    if (Math.abs(view.scale - fit) < 0.01) {
      // From "whole thing" to a closer look at the clicked spot.
      zoom(vector || fit >= 1 ? fit * 2 : 1, localPoint(e));
    } else {
      showFit();
    }
  }

  onMount(() => {
    const el = stage!;
    // Wheel zooms toward the pointer: a mouse wheel notch steps, a trackpad
    // pinch (ctrl+wheel) is continuous. Registered by hand to be non-passive,
    // and stopped here so the page's pinch-to-resize-text never sees it.
    let gestureBase: number | null = null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (gestureBase !== null) return;
      zoom(view.scale * wheelFactor(e.deltaY, e.deltaMode, e.ctrlKey), localPoint(e));
    };
    type Gesture = Event & { scale: number; clientX: number; clientY: number };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      gestureBase = view.scale;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      const g = e as Gesture;
      if (gestureBase !== null) zoom(gestureBase * g.scale, localPoint(g));
    };
    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      gestureBase = null;
    };
    const opts = { passive: false };
    el.addEventListener("wheel", onWheel, opts);
    el.addEventListener("gesturestart", onGestureStart, opts);
    el.addEventListener("gesturechange", onGestureChange, opts);
    el.addEventListener("gestureend", onGestureEnd, opts);

    // Capture phase, so the document underneath never sees these keys.
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable='true'], [role='dialog'], [role='menu']"))
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const actions: Record<string, () => void> = {
        Escape: onclose,
        ArrowLeft: () => step(-1),
        ArrowRight: () => step(1),
        "+": () => zoom(view.scale * ZOOM_STEP),
        "=": () => zoom(view.scale * ZOOM_STEP),
        "-": () => zoom(view.scale / ZOOM_STEP),
        "0": showFit,
        "1": showActualSize,
      };
      const run = actions[e.key];
      if (!run) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      run();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", onGestureEnd);
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  });
</script>

{#snippet iconButton(label: string, onclick: () => void, Icon: typeof X, disabled = false)}
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <Button {...props} variant="ghost" size="icon" class="size-7" {disabled} {onclick}>
          <Icon class="size-4" />
        </Button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content>{label}</Tooltip.Content>
  </Tooltip.Root>
{/snippet}

<!-- Tooltips need their own provider; the toolbar's does not reach here. -->
<Tooltip.Provider delayDuration={400}>
  <div class="no-print absolute inset-0 z-40 flex flex-col bg-background">
    <div class="flex h-10 shrink-0 items-center gap-1 border-b px-3">
      <span class="min-w-0 truncate text-sm font-medium" title={item?.title}>{item?.title}</span>
      <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
        {#if natural && item?.kind === "img"}{Math.round(natural.w)} × {Math.round(natural.h)}{/if}
        {#if items.length > 1}<span class="ml-2">{index + 1} / {items.length}</span>{/if}
      </span>

      <div class="ml-auto flex items-center gap-0.5">
        {#if items.length > 1}
          {@render iconButton("Previous (←)", () => step(-1), ChevronLeft)}
          {@render iconButton("Next (→)", () => step(1), ChevronRight)}
          <div class="mx-1 h-4 w-px bg-border"></div>
        {/if}
        {@render iconButton("Zoom out (−)", () => zoom(view.scale / ZOOM_STEP), ZoomOut, !natural)}
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                class="h-7 w-14 rounded-md text-xs tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onclick={showFit}
              >
                {Math.round(view.scale * 100)}%
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>Fit to window (0)</Tooltip.Content>
        </Tooltip.Root>
        {@render iconButton("Zoom in (+)", () => zoom(view.scale * ZOOM_STEP), ZoomIn, !natural)}
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                class="h-7 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onclick={showActualSize}
              >
                1:1
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>Actual size (1)</Tooltip.Content>
        </Tooltip.Root>
        {#if actions}
          <div class="mx-1 h-4 w-px bg-border"></div>
          {@render actions()}
        {/if}
        <div class="mx-1 h-4 w-px bg-border"></div>
        {@render iconButton("Close (Esc)", onclose, X)}
      </div>
    </div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      bind:this={stage}
      bind:clientWidth={stageSize.w}
      bind:clientHeight={stageSize.h}
      class="zoom-stage relative min-h-0 flex-1 touch-none overflow-hidden select-none
        {dragging ? 'cursor-grabbing' : 'cursor-grab'}"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      ondblclick={onDoubleClick}
    >
      {#if failed}
        <p class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          This image could not be displayed.
        </p>
      {:else if item}
        {#key item}
          <div
            class="absolute top-0 left-0 origin-top-left"
            style="transform: translate({view.x}px, {view.y}px);
              width: {natural ? natural.w * view.scale : 0}px;
              height: {natural ? natural.h * view.scale : 0}px;
              visibility: {natural ? 'visible' : 'hidden'}"
          >
            {#if item.kind === "img"}
              <img
                src={item.src}
                alt={item.title}
                draggable="false"
                class="block size-full"
                onload={onImgLoad}
                onerror={() => (failed = true)}
              />
            {:else}
              <div bind:this={svgHost} class="size-full">
                <!-- eslint-disable-next-line svelte/no-at-html-tags -- a diagram already rendered (and sanitized) in the page -->
                {@html item.svg}
              </div>
            {/if}
          </div>
        {/key}
      {/if}
    </div>
  </div>
</Tooltip.Provider>
