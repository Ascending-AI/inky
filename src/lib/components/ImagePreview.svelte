<script lang="ts">
  import { onMount } from "svelte";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { toast } from "svelte-sonner";
  import { app } from "$lib/state.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import X from "@lucide/svelte/icons/x";

  const path = $derived(app.imagePath ?? "");
  const name = $derived(path.split("/").pop() ?? "");
  const siblings = $derived(app.imageSiblings);
  const index = $derived(siblings.indexOf(path));
  let size = $state<{ w: number; h: number } | null>(null);
  let failed = $state(false);

  $effect(() => {
    void path;
    size = null;
    failed = false;
  });

  function step(delta: number) {
    if (siblings.length < 2 || index < 0) return;
    app.openImage(siblings[(index + delta + siblings.length) % siblings.length]);
  }

  async function openExternally() {
    const { openPath } = await import("@tauri-apps/plugin-opener");
    openPath(path).catch((e) => toast.error(`Could not open image: ${e}`));
  }

  async function revealInFinder() {
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    revealItemInDir(path).catch((e) => toast.error(`${e}`));
  }

  onMount(() => {
    // Capture phase, so the document underneath never sees these keys.
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable='true'], [role='dialog'], [role='menu']"))
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const actions: Record<string, () => void> = {
        Escape: () => app.closeImage(),
        ArrowLeft: () => step(-1),
        ArrowUp: () => step(-1),
        ArrowRight: () => step(1),
        ArrowDown: () => step(1),
      };
      const run = actions[e.key];
      if (!run) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      run();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  });
</script>

<!-- Tooltips need a provider; the toolbar's does not reach this far. -->
<Tooltip.Provider delayDuration={400}>
<div class="no-print absolute inset-0 z-40 flex flex-col bg-background">
  <div class="flex h-10 shrink-0 items-center gap-1 border-b px-3">
    <span class="min-w-0 truncate text-sm font-medium" title={path}>{name}</span>
    <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
      {#if size}{size.w} × {size.h}{/if}
      {#if siblings.length > 1 && index >= 0}
        <span class="ml-2">{index + 1} / {siblings.length}</span>
      {/if}
    </span>
    <div class="ml-auto flex items-center gap-0.5">
      {#if siblings.length > 1}
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button {...props} variant="ghost" size="icon" class="size-7" onclick={() => step(-1)}>
                <ChevronLeft class="size-4" />
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>Previous image (←)</Tooltip.Content>
        </Tooltip.Root>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button {...props} variant="ghost" size="icon" class="size-7" onclick={() => step(1)}>
                <ChevronRight class="size-4" />
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>Next image (→)</Tooltip.Content>
        </Tooltip.Root>
      {/if}
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon" class="size-7" onclick={openExternally}>
              <ExternalLink class="size-4" />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>Open in default app</Tooltip.Content>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon" class="size-7" onclick={revealInFinder}>
              <FolderOpen class="size-4" />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>Show in Finder</Tooltip.Content>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="icon"
              class="size-7"
              onclick={() => app.closeImage()}
            >
              <X class="size-4" />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>Close (Esc)</Tooltip.Content>
      </Tooltip.Root>
    </div>
  </div>

  <!-- Clicking the empty area around the image closes the preview. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6"
    onclick={(e) => e.target === e.currentTarget && app.closeImage()}
  >
    {#if failed}
      <p class="text-sm text-muted-foreground">This image could not be displayed.</p>
    {:else}
      {#key path}
        <img
          src={convertFileSrc(path)}
          alt={name}
          class="max-h-full max-w-full rounded-sm object-contain shadow-sm"
          onload={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            size = { w: img.naturalWidth, h: img.naturalHeight };
          }}
          onerror={() => (failed = true)}
        />
      {/key}
    {/if}
  </div>
</div>
</Tooltip.Provider>
