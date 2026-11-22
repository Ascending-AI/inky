import { app } from "./state.svelte";

/**
 * Behaviour shared by every video Inky shows (a video tab, or one embedded in
 * a document): start where a timestamp link asked or where it was left, and
 * remember the place as it plays. Returns a function that detaches it.
 */
export function attachVideo(video: HTMLVideoElement, path: string): () => void {
  let lastSave = 0;
  const start = () => {
    const { time, play } = app.videoStart(path, video.duration);
    if (time > 0) video.currentTime = Number.isFinite(video.duration) ? Math.min(time, video.duration) : time;
    if (play) video.play().catch(() => {});
  };
  const save = (force: boolean) => {
    const now = Date.now();
    if ((!force && now - lastSave < 2000) || !Number.isFinite(video.duration)) return;
    lastSave = now;
    app.rememberVideo(path, video.currentTime, video.duration);
  };
  const onTime = () => save(false);
  const onStop = () => save(true);
  video.addEventListener("loadedmetadata", start);
  video.addEventListener("timeupdate", onTime);
  for (const type of ["pause", "seeked", "ended"]) video.addEventListener(type, onStop);
  if (video.readyState >= 1) start();
  return () => {
    save(true);
    video.removeEventListener("loadedmetadata", start);
    video.removeEventListener("timeupdate", onTime);
    for (const type of ["pause", "seeked", "ended"]) video.removeEventListener(type, onStop);
  };
}

/**
 * Load a new version of the file (an agent replaced it) without losing the
 * viewer's place: same moment, still playing if it was.
 */
export function swapSource(video: HTMLVideoElement, url: string) {
  const time = video.currentTime;
  const playing = !video.paused && !video.ended;
  video.src = url;
  // Registered after attachVideo's own listener, so this place wins.
  video.addEventListener(
    "loadedmetadata",
    () => {
      video.currentTime = Math.min(time, video.duration || time);
      if (playing) video.play().catch(() => {});
    },
    { once: true },
  );
}
