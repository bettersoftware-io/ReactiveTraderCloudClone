// packages/client-react-native/src/ui/shell/boot/scenes/laserGeometry.ts
import { clamp01 } from "#/ui/shell/boot/scenes/coreGeometry";

/**
 * Pure geometry/timing helpers for `LaserScene` — the "UI panels traced in by
 * a sweeping laser" scene. Kept out of the component so the panel table and
 * reveal math are directly unit-testable with vitest, no Skia or Reanimated
 * involved (same split as `coreGeometry.ts` for `CoreScene`).
 *
 * Ported from `drawBootLaser` in
 * `packages/client-react/src/ui/shell/boot/bootCanvas.ts` (2D-only, no
 * projection — see that file's panel table, lines 112-167). Task 7 (phase
 * 6a) ports the panel table and its per-panel trace-in window as a
 * DECLARATIVE Skia `<Path>` per panel (`start`/`end` trim, driven by
 * `useDerivedValue` off `elapsedSec`) — the opposite idiom from `CoreScene`'s
 * imperative `createPicture` recording.
 *
 * DEFERRED (each a distinct visual layer in the web source, left out here
 * rather than half-ported, same discipline as `CoreScene`'s header comment):
 *   - per-kind panel content (header chips, main tiles+sparkline, list rows,
 *     blotter grid, status dots) — `drawPanelContent`'s five branches;
 *   - the completion corner-ticks (`drawFrac > 0.985`);
 *   - the post-trace flash wash (`progress in [t1, t1+0.07]`);
 *   - the laser draw-head (glow dot + emitter beam) — the web tracks the
 *     exact point on the rectangle's perimeter the trace has reached;
 *     Skia's declarative `<Path start/end>` trims the same stroke without
 *     needing that point computed separately, so the head has no direct
 *     declarative counterpart here;
 *   - the background HUD grid + translucent wash the web variant paints
 *     first (`ctx.fillRect` + 44px grid lines);
 *   - the per-panel border-stroke glow (`ctx.shadowBlur`/`shadowColor` on the
 *     same trace stroke this scene does port) — the outline is drawn, the
 *     neon bloom around it is not.
 */

/** A single traced-in UI panel: normalised screen-space rectangle
 * (`nx/ny/nw/nh`, 0..1 fractions of width/height) plus the boot-progress
 * window (`t0..t1`) it traces in across, and a content `kind` tag (unused by
 * Task 7's border-only trace, kept for the deferred per-kind content pass). */
export interface LaserPanel {
  readonly nx: number;
  readonly ny: number;
  readonly nw: number;
  readonly nh: number;
  readonly t0: number;
  readonly t1: number;
  readonly kind: string;
}

/** Verbatim from the web `drawBootLaser`'s `panels` table
 * (bootCanvas.ts:112-167) — design values, not re-derived or rounded. */
export const LASER_PANELS: readonly LaserPanel[] = [
  {
    nx: 0.055,
    ny: 0.045,
    nw: 0.89,
    nh: 0.075,
    t0: 0.0,
    t1: 0.1,
    kind: "header",
  },
  {
    nx: 0.055,
    ny: 0.155,
    nw: 0.56,
    nh: 0.5,
    t0: 0.09,
    t1: 0.32,
    kind: "main",
  },
  {
    nx: 0.635,
    ny: 0.155,
    nw: 0.31,
    nh: 0.235,
    t0: 0.3,
    t1: 0.45,
    kind: "list",
  },
  {
    nx: 0.635,
    ny: 0.415,
    nw: 0.31,
    nh: 0.24,
    t0: 0.43,
    t1: 0.57,
    kind: "list",
  },
  {
    nx: 0.055,
    ny: 0.685,
    nw: 0.89,
    nh: 0.17,
    t0: 0.55,
    t1: 0.68,
    kind: "blotter",
  },
  {
    nx: 0.055,
    ny: 0.875,
    nw: 0.89,
    nh: 0.05,
    t0: 0.66,
    t1: 0.74,
    kind: "status",
  },
];

/** A panel's trace-in fraction at the current boot `progress`: 0 before
 * `t0`, ramping linearly to 1 across `[t0, t1]`, then held at 1 — verbatim
 * shape of the web's `drawFrac = clamp((progress - t0) / (t1 - t0))`. Once a
 * panel reaches 1 it stays there for the rest of the boot (progress only
 * increases), which is what keeps it "fully revealed" rather than re-hiding. */
export function panelRevealFraction(
  progress: number,
  t0: number,
  t1: number,
): number {
  "worklet";
  return clamp01((progress - t0) / (t1 - t0));
}

/** SVG-style rectangle outline, traced top → right → bottom → left (closing
 * back to the start along the left edge) — the same segment order as the
 * web's `segments` array, so a `<Path start=0 end={drawFrac}>` trim sweeps
 * the border in the identical direction the imperative version draws it. */
export function rectTracePath(
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  return `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`;
}
