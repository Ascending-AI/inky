<script lang="ts">
  import { applyThemeTo } from "$lib/themes/apply";
  import type { Theme } from "$lib/themes/model";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Folder from "@lucide/svelte/icons/folder";
  import FileText from "@lucide/svelte/icons/file-text";

  /**
   * A miniature Inky in a given theme: fixed sample content built from the
   * app's own classes (`.prose-doc`, `.tab-strip`, the sidebar's), so it looks
   * exactly like the app would, whatever theme the app itself is showing.
   */
  let { theme }: { theme: Theme } = $props();

  let root: HTMLDivElement;
  $effect(() => applyThemeTo(root, theme));

  const tree: { name: string; depth: number; dir?: boolean; open?: boolean; active?: boolean }[] = [
    { name: "Research", depth: 0, dir: true, open: true },
    { name: "Agent memory survey", depth: 1, active: true },
    { name: "Reading research", depth: 1 },
    { name: "Notes", depth: 0, dir: true },
    { name: "Specs", depth: 0, dir: true },
  ];
</script>

<!-- Fixed sample content: not interactive. -->
<div
  bind:this={root}
  inert
  class="flex h-full min-h-0 overflow-hidden rounded-lg border bg-background text-foreground shadow-sm"
>
  <aside class="flex w-44 shrink-0 flex-col gap-px border-r border-sidebar-border bg-sidebar px-2 py-3 text-sidebar-foreground">
    {#each tree as n (n.name)}
      <div
        class="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px]
          {n.active ? 'bg-accent font-medium text-accent-foreground' : ''}"
        style="padding-left: {8 + n.depth * 14}px"
      >
        {#if n.dir}
          <ChevronRight class="size-3.5 shrink-0 {n.open ? 'rotate-90' : ''}" />
          <Folder class="size-4 shrink-0 opacity-70" />
        {:else}
          <FileText class="ml-[18px] size-4 shrink-0 opacity-70" />
        {/if}
        <span class="truncate">{n.name}</span>
      </div>
    {/each}
  </aside>

  <div class="flex min-w-0 flex-1 flex-col">
    <div class="tab-strip shrink-0">
      {#each ["Agent memory survey", "Reading research", "Weekly notes"] as name, i (name)}
        <div class="tab" aria-selected={i === 0}>
          <span class="tab-sep"></span>
          <div class="tab-inner"><span class="min-w-0 flex-1 truncate">{name}</span></div>
        </div>
      {/each}
    </div>

    <div class="sample-doc min-h-0 flex-1 overflow-hidden px-8 py-6">
      <article class="prose-doc">
        <h1>Agent memory survey</h1>
        <p>
          Long-running agents forget. This survey compares <a href="#sample">five approaches</a> to
          memory, and finds that <mark class="hl hl-yellow">retrieval beats summarisation</mark> once a
          task runs past a few hours. The <mark class="comment-hl">cost estimates</mark> assume
          <code>gpt-class</code> pricing.
        </p>
        <blockquote><p>Memory is only useful if the agent knows when to look.</p></blockquote>
        <h2>Results</h2>
        <table>
          <thead><tr><th>Approach</th><th>Recall</th><th>Cost</th></tr></thead>
          <tbody>
            <tr><td>Retrieval</td><td>0.82</td><td>Low</td></tr>
            <tr><td>Summaries</td><td>0.61</td><td>Lowest</td></tr>
          </tbody>
        </table>
        <pre class="code-block" data-lang="JSON"><code class="hljs language-json"
            >{"{"}
  <span class="hljs-attr">"approach"</span>: <span class="hljs-string">"retrieval"</span>,
  <span class="hljs-attr">"recall"</span>: <span class="hljs-number">0.82</span>
{"}"}</code></pre>
      </article>
    </div>
  </div>
</div>

<style>
  /* A miniature: smaller type and the full width of the pane. */
  .sample-doc {
    --prose-scale: 0.8;
    --prose-width: none;
  }
</style>
