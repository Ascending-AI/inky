/** Toggle full screen for a video (or any element); WebKit's prefixed API as a fallback. */
export function toggleFullscreen(el: HTMLElement) {
  type Prefixed = { webkitRequestFullscreen?: () => void; webkitExitFullscreen?: () => void };
  const doc = document as Document & Prefixed & { webkitFullscreenElement?: Element | null };
  if (doc.fullscreenElement ?? doc.webkitFullscreenElement) {
    if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
    else doc.webkitExitFullscreen?.();
    return;
  }
  const target = el as HTMLElement & Prefixed;
  if (target.requestFullscreen) target.requestFullscreen().catch(() => {});
  else target.webkitRequestFullscreen?.();
}
