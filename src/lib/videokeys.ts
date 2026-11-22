/** Seconds that ← / → move a video back or ahead. */
export const SEEK_SECONDS = 5;

/**
 * How far a key press moves the video being watched: ∓5 s for a plain ← or
 * →, null for anything else (modified arrows keep their own shortcuts, and
 * typing is never taken over).
 */
export function seekStep(e: KeyboardEvent): number | null {
  if (!plain(e) || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return null;
  return e.key === "ArrowLeft" ? -SEEK_SECONDS : SEEK_SECONDS;
}

/** A plain Space, which plays or pauses the video being watched. */
export function isPlayKey(e: KeyboardEvent): boolean {
  return e.key === " " && plain(e);
}

/** No modifier, and not typing somewhere. */
function plain(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
  const t = e.target as HTMLElement | null;
  return !t?.closest?.("input, textarea, [contenteditable='true'], .cm-editor");
}

/** Play a paused video, pause a playing one. */
export function togglePlay(video: HTMLVideoElement) {
  if (video.paused || video.ended) video.play().catch(() => {});
  else video.pause();
}

/** Move `video` by `seconds`, staying within it. */
export function seekBy(video: HTMLVideoElement, seconds: number) {
  const end = Number.isFinite(video.duration) ? video.duration : Infinity;
  video.currentTime = Math.min(Math.max(0, video.currentTime + seconds), end);
}
