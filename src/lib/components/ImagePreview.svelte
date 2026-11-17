<script lang="ts">
  import { fileManager } from "$lib/platform";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { toast } from "svelte-sonner";
  import { app } from "$lib/state.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import ZoomViewer, { type MediaItem } from "./ZoomViewer.svelte";

  /** A library image from the sidebar, stepping through its folder's images. */
  const path = $derived(app.imagePath ?? "");
  const paths = $derived(app.imageSiblings.includes(path) ? app.imageSiblings : [path]);
  const index = $derived(paths.indexOf(path));
  const items = $derived<MediaItem[]>(
    paths.map((p) => ({ kind: "img", src: convertFileSrc(p), title: p.split("/").pop() ?? p })),
  );

  async function openExternally() {
    const { openPath } = await import("@tauri-apps/plugin-opener");
    openPath(path).catch((e) => toast.error(`Could not open image: ${e}`));
  }

  async function revealInFinder() {
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    revealItemInDir(path).catch((e) => toast.error(`${e}`));
  }
</script>

<ZoomViewer
  {items}
  {index}
  onindex={(i) => app.openImage(paths[i])}
  onclose={() => app.closeImage()}
>
  {#snippet actions()}
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
      <Tooltip.Content>Show in {fileManager}</Tooltip.Content>
    </Tooltip.Root>
  {/snippet}
</ZoomViewer>
