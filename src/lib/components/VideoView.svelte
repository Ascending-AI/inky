<script lang="ts">
  import { app } from "$lib/state.svelte";
  import Film from "@lucide/svelte/icons/film";
  import { toggleFullscreen } from "$lib/fullscreen";
  import { attachVideo, swapSource } from "$lib/videoplayer";

  /** A library video in its own tab: centred, fitted to the pane, native controls. */
  let { path }: { path: string } = $props();

  const name = $derived(path.split("/").pop() ?? path);
  /** Versioned once an agent replaces the file (see app.checkImages). */
  const url = $derived(app.imageUrl(path));
  let failed = $state(false);
  let video: HTMLVideoElement | undefined = $state();

  // Record the file's stamp, so a later replacement is noticed.
  $effect(() => {
    app.checkImages([path]);
  });

  // A new version gets another try, even after a failed one (a file caught
  // half-written), and keeps the viewer's place.
  let shownUrl = "";
  $effect(() => {
    if (url !== shownUrl) failed = false;
  });
  $effect(() => {
    if (!video || url === shownUrl) return;
    if (shownUrl && video.src) swapSource(video, url);
    else video.src = url;
    shownUrl = url;
  });

  $effect(() => {
    if (video) return attachVideo(video, path);
  });

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
      controls
      preload="metadata"
      class="max-h-full min-h-0 max-w-full rounded-lg bg-black shadow-sm"
      onerror={() => {
        failed = true;
        shownUrl = "";
      }}
      ondblclick={() => video && toggleFullscreen(video)}
    ></video>
    <p class="shrink-0 truncate text-xs text-muted-foreground">{name}</p>
  {/if}
</div>
