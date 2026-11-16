/**
 * Pan/zoom math for the image and diagram viewer. A view is the content's
 * scale (1 = natural pixel size) and the position of its top-left corner in
 * the stage. The content is laid out at its scaled size (not CSS-scaled),
 * so vector diagrams stay crisp at every zoom level.
 */

export interface Size {
  w: number;
  h: number;
}

export interface View {
  scale: number;
  x: number;
  y: number;
}

/** Breathing room around fitted content. */
export const PAD = 32;

/**
 * Scale that fits `content` inside `stage`. Raster images never enlarge past
 * their natural size (they would only blur); vector diagrams may, so small
 * ones become readable.
 */
export function fitScale(content: Size, stage: Size, vector: boolean): number {
  if (content.w <= 0 || content.h <= 0) return 1;
  const fit = Math.min((stage.w - 2 * PAD) / content.w, (stage.h - 2 * PAD) / content.h);
  return Math.max(0.01, Math.min(fit, vector ? 3 : 1));
}

export function scaleLimits(fit: number): { min: number; max: number } {
  return { min: Math.min(fit, 1) * 0.5, max: Math.max(8, fit * 4) };
}

/**
 * Keep the content reachable: centered on an axis where it is smaller than
 * the stage, otherwise never pulled further in than the padding.
 */
export function clampView(v: View, content: Size, stage: Size): View {
  const axis = (pos: number, size: number, room: number) => {
    if (size <= room - 2 * PAD) return (room - size) / 2;
    return Math.min(PAD, Math.max(room - size - PAD, pos));
  };
  return {
    scale: v.scale,
    x: axis(v.x, content.w * v.scale, stage.w),
    y: axis(v.y, content.h * v.scale, stage.h),
  };
}

export function fitView(content: Size, stage: Size, vector: boolean): View {
  const scale = fitScale(content, stage, vector);
  return clampView({ scale, x: 0, y: 0 }, content, stage);
}

/** Zoom to `scale` (clamped) keeping the content point under `at` in place. */
export function zoomTo(
  v: View,
  scale: number,
  at: { x: number; y: number },
  content: Size,
  stage: Size,
  vector: boolean,
): View {
  const { min, max } = scaleLimits(fitScale(content, stage, vector));
  const next = Math.min(max, Math.max(min, scale));
  const k = next / v.scale;
  return clampView(
    { scale: next, x: at.x - (at.x - v.x) * k, y: at.y - (at.y - v.y) * k },
    content,
    stage,
  );
}

/** Zoom factor for one wheel event: a mouse notch is ~±15%, a pinch is finer. */
export function wheelFactor(deltaY: number, deltaMode: number, pinch: boolean): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(-px * (pinch ? 0.01 : 0.0015));
}

/** Steps for the + / − buttons and keys. */
export const ZOOM_STEP = 1.25;
