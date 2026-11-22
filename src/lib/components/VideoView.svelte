<script lang="ts">
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { app } from "$lib/state.svelte";
  import Film from "@lucide/svelte/icons/film";
  import { toggleFullscreen } from "$lib/fullscreen";

  /** A library video in its own tab: centred, fitted to the pane, native controls. */
  let { path }: { path: string } = $props();

  const name = $derived(path.split("/").pop() ?? path);
  let failed = $state(false);
  let video: HTMLVideoElement | undefined = $state();

  // Space plays and pauses, as in any player, unless the video has focus
  // (its own controls handle the key then) or the reader is typing.
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== " " || !video || app.viewerOpen) return;
    const t = e.target as HTMLElement | null;
    if (t === video || t?.closest("input, textarea, [contenteditable]")) return;
    e.preventDefault();
    if (video.paused) video.play();
    else video.pause();
  }
</script>

<svelte:window {onkeydown} />

<div class="no-print flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-background p-6">
  {#if failed}
    <div class="flex flex-col items-center gap-2 text-sm text-muted-foreground">
      <Film class="size-8 opacity-60" />
      <p>Can't play {name}.</p>
      <p class="text-xs">The file may be missing, or in a format macOS can't play.</p>
    </div>
  {:else}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={video}
      src={convertFileSrc(path)}
      controls
      preload="metadata"
      class="max-h-full min-h-0 max-w-full rounded-lg bg-black shadow-sm"
      onerror={() => (failed = true)}
      ondblclick={() => video && toggleFullscreen(video)}
    ></video>
    <p class="shrink-0 truncate text-xs text-muted-foreground">{name}</p>
  {/if}
</div>
