/** Browser-side colour resolution. Needs a DOM; not unit-tested. */

let ctx: CanvasRenderingContext2D | null = null;

const hex2 = (n: number) => n.toString(16).padStart(2, "0");

/**
 * Any CSS colour (color-mix, oklch, ...) to `#rrggbb`, or `#rrggbbaa` when not
 * opaque. `null` when the string does not parse.
 */
export function resolveColor(css: string): string | null {
  // A canvas cannot resolve var(); it would silently keep the previous fill.
  if (/var\(/i.test(css)) return null;
  if (typeof CSS !== "undefined" && !CSS.supports("color", css)) return null;
  if (!ctx) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const rgb = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  return a === 255 ? rgb : `${rgb}${hex2(a)}`;
}
