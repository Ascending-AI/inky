import { isVideoPath } from "./paths";

/**
 * Time in videos: links that start a video at a moment
 * (`explainer.mp4#t=135`, `#t=2:15`) and the place each video was left at.
 */

/** Seconds from `135`, `12.5`, `2:15` or `1:02:03`; null if it is none of those. */
function clockSeconds(value: string): number | null {
  if (!/^\d+(?:\.\d+)?$|^\d+(?::\d{1,2}){1,2}(?:\.\d+)?$/.test(value)) return null;
  return value.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

/**
 * A relative link to a video, with the moment it starts at (the media
 * fragment `#t=…`; its end time is ignored). Null for any other link.
 */
export function parseVideoLink(href: string): { path: string; time: number | null } | null {
  if (!href || href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  const hash = href.indexOf("#");
  const raw = hash < 0 ? href : href.slice(0, hash);
  let path = raw;
  try {
    path = decodeURI(raw);
  } catch {
    // A literal "%" in the name: keep it as written.
  }
  if (!isVideoPath(path)) return null;
  const fragment = hash < 0 ? "" : href.slice(hash + 1);
  const t = /(?:^|&)t=(?:npt:)?([^,&]+)/.exec(fragment)?.[1];
  return { path, time: t === undefined ? null : clockSeconds(t) };
}

/** Within this many seconds of either end, a video starts over next time. */
const EDGE = 5;
/** Videos whose places are kept; the oldest are forgotten. */
export const RESUME_MAX = 200;

/** Where to start a video of `duration` seconds that was left at `saved`. */
export function resumeAt(saved: number | undefined, duration: number): number {
  if (saved === undefined || saved < EDGE || saved > duration - EDGE) return 0;
  return saved;
}

/** `positions` with `path` left at `time` (most recent last). */
export function rememberPosition(
  positions: Record<string, number>,
  path: string,
  time: number,
  duration: number,
): Record<string, number> {
  const next = { ...positions };
  delete next[path];
  if (resumeAt(time, duration) > 0) next[path] = Math.round(time * 10) / 10;
  const keys = Object.keys(next);
  for (const old of keys.slice(0, Math.max(0, keys.length - RESUME_MAX))) delete next[old];
  return next;
}
