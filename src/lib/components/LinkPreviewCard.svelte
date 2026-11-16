<script lang="ts" module>
  export interface LinkPreview {
    /** Small caption above the content ("Footnote 3", a document name…). */
    label: string;
    /** Sanitized HTML cut from a rendered page; empty for external links. */
    html: string;
    /** External address, shown instead of content. */
    url?: string;
    hint: string;
    /** What clicking the card opens (null: clicking just closes it). */
    open: string | null;
    /** Links and cited paths inside the card open individually (only for
     *  content from this document, whose relative links resolve here). */
    innerLinks: boolean;
    x: number;
    y: number;
    /** Open upward (the link sits near the bottom of the pane). */
    above: boolean;
  }
</script>

<script lang="ts">
  import { tick } from "svelte";
  import { fade } from "svelte/transition";

  interface Props {
    preview: LinkPreview;
    onenter: () => void;
    onleave: () => void;
    onopen: (href: string | null) => void;
  }
  let { preview, onenter, onleave, onopen }: Props = $props();

  let body: HTMLDivElement | undefined = $state();
  /** Content taller than the card: fade the cut-off edge. */
  let clipped = $state(false);
  $effect(() => {
    void preview.html;
    tick().then(() => {
      clipped = !!body && body.scrollHeight > body.clientHeight + 1;
    });
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="link-preview no-print absolute z-30 w-[22rem] overflow-hidden {preview.open
    ? 'cursor-pointer'
    : ''} rounded-lg border bg-popover text-popover-foreground shadow-lg"
  style="left: {preview.x}px; top: {preview.y}px; {preview.above ? 'transform: translateY(-100%)' : ''}"
  transition:fade={{ duration: 100 }}
  onmouseenter={onenter}
  onmouseleave={onleave}
  onmousedown={(e) => e.preventDefault()}
  onclick={(e) => {
    e.stopPropagation();
    e.preventDefault();
    const inner = preview.innerLinks
      ? (e.target as HTMLElement).closest<HTMLElement>("a[href], [data-open-href]")
      : null;
    onopen(inner ? (inner.getAttribute("href") ?? inner.dataset.openHref ?? null) : preview.open);
  }}
>
  <div class="truncate border-b px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
    {preview.label}
  </div>
  {#if preview.url}
    <p class="px-3 py-2 text-xs break-all">{preview.url}</p>
  {:else}
    <div
      bind:this={body}
      class="prose-doc link-preview-body max-h-64 overflow-hidden px-3 py-2"
      class:clipped
    >
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- cut from DOMPurify-sanitized renders -->
      {@html preview.html}
    </div>
  {/if}
  {#if preview.hint}
    <div class="truncate border-t px-3 py-1 text-[10px] text-muted-foreground/80">{preview.hint}</div>
  {/if}
</div>
