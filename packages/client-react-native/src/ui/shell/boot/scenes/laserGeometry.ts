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
 * DEFERRED — the one layer still left out, same discipline as `CoreScene`'s
 * header comment:
 *   - the per-panel border-stroke glow (`ctx.shadowBlur`/`shadowColor` on the
 *     same trace stroke this scene does port) — the outline is drawn, the
 *     neon bloom around it is not (docs/performance.md — no `MaskFilter`
 *     blur on a per-frame stroke). The web's draw-head glow (`shadowBlur`
 *     22/14 on the two head circles) is skipped for the same reason.
 *
 * Task 5 added the background HUD grid + translucent wash, the post-trace
 * flash, and the completion corner ticks — see `drawBootLaser` in
 * `packages/boot-splash/src/bootCanvas.ts`, lines 292-310 (wash + grid),
 * 383-387 (flash) and 389-407 (corner ticks).
 *
 * Task 6 completes the port: per-kind panel content (`drawPanelContent`'s
 * five branches, ported to `laserPanelContent.ts`) and the laser draw-head
 * (glow dot + emitter beam). The web tracks the exact point on the
 * rectangle's perimeter the trace has reached to draw the head; Skia's
 * declarative `<Path start/end>` trims the same stroke without ever
 * computing that point, so `perimeterPoint` below (walking the same
 * four-segment perimeter `rectTracePath` traces) fills the gap — `LaserScene`
 * drives a `<Circle>` pair plus an emitter `<Line>` off it.
 */

/** A single traced-in UI panel: normalised screen-space rectangle
 * (`nx/ny/nw/nh`, 0..1 fractions of width/height) plus the boot-progress
 * window (`t0..t1`) it traces in across, and a content `kind` tag consumed by
 * `laserPanelContent.ts`'s `panelContentShapes` to pick the right branch. */
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

/** Panel rectangle in pixels. Shaped like Skia's `SkRect` (`x`/`y`/`width`/
 * `height`) so it can be handed straight to a draw call or a `<Rect>` without
 * a translation step. */
export interface LaserRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function panelRectPx(
  panel: LaserPanel,
  width: number,
  height: number,
): LaserRect {
  return {
    x: panel.nx * width,
    y: panel.ny * height,
    width: panel.nw * width,
    height: panel.nh * height,
  };
}

/** The web's HUD grid pitch (`x += 44`). */
export const LASER_GRID_STEP = 44;
/** The flat wash the web paints under everything (`rgba(0,0,0,0.42)`). */
export const LASER_WASH = "rgba(0,0,0,0.42)";
export const LASER_GRID_ALPHA = 0.045;

/**
 * Grid-line offsets along one axis. Floors the step at 1 for the same reason
 * `drawBootDocking` does: a zero step would never advance the loop, which is
 * an infinite loop rather than a wasted frame.
 */
export function gridLinePositions(
  extent: number,
  step: number,
): readonly number[] {
  const safeStep = Math.max(1, step);
  const positions: number[] = [];

  for (let at = 0; at < extent; at += safeStep) {
    positions.push(at);
  }

  return positions;
}

/** Grid lines as one SVG path string, built once per viewport size — the
 * shape depends only on width/height, so it must never be rebuilt per frame
 * (docs/performance.md). */
export function gridPath(width: number, height: number): string {
  const parts: string[] = [];

  for (const x of gridLinePositions(width, LASER_GRID_STEP)) {
    parts.push(`M${x} 0 L${x} ${height}`);
  }

  for (const y of gridLinePositions(height, LASER_GRID_STEP)) {
    parts.push(`M0 ${y} L${width} ${y}`);
  }

  return parts.join(" ");
}

const FLASH_WINDOW = 0.07;

/** Post-trace flash: a full-panel wash that fires the instant a panel
 * finishes tracing and fades out over the next 7% of boot progress. */
export function panelFlashAlpha(progress: number, t1: number): number {
  "worklet";

  if (progress < t1 || progress >= t1 + FLASH_WINDOW) {
    return 0;
  }

  return 1 - (progress - t1) / FLASH_WINDOW;
}

export const FLASH_PEAK_OPACITY = 0.2;
/** Trace fraction past which the completion corner ticks appear. */
export const CORNER_TICK_THRESHOLD = 0.985;
export const CORNER_TICK_LENGTH = 8;
export const CORNER_TICK_OPACITY = 0.85;
export const CORNER_TICK_STROKE_WIDTH = 1.4;

/** Four corner "L" brackets as one SVG path, drawn inward from each corner —
 * verbatim geometry from the web's `[x, y, dx, dy]` corner table. */
export function cornerTickPath(rect: LaserRect, tickLength: number): string {
  const corners: ReadonlyArray<readonly [number, number, number, number]> = [
    [rect.x, rect.y, 1, 1],
    [rect.x + rect.width, rect.y, -1, 1],
    [rect.x, rect.y + rect.height, 1, -1],
    [rect.x + rect.width, rect.y + rect.height, -1, -1],
  ];
  return corners
    .map(([cx, cy, dx, dy]) => {
      return `M${cx} ${cy + dy * tickLength} L${cx} ${cy} L${cx + dx * tickLength} ${cy}`;
    })
    .join(" ");
}

/** A plain screen-space point — the draw-head's position, both at rest (the
 * emitter) and while tracing (`perimeterPoint`'s return value). */
export interface LaserPoint {
  readonly x: number;
  readonly y: number;
}

/** The point at `fraction` along the panel rect's perimeter, walked in the
 * same top → right → bottom → left order `rectTracePath` traces. This is what
 * `<Path start/end>` trimming hides: the laser draw-head needs the trace's
 * actual current point, which the trim never exposes. */
export function perimeterPoint(rect: LaserRect, fraction: number): LaserPoint {
  "worklet";
  const segments: ReadonlyArray<readonly [number, number, number, number]> = [
    [rect.x, rect.y, rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height],
    [rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height],
    [rect.x, rect.y + rect.height, rect.x, rect.y],
  ];
  const perimeter = (rect.width + rect.height) * 2;
  let remaining = clamp01(fraction) * perimeter;

  for (const [x0, y0, x1, y1] of segments) {
    const length = Math.hypot(x1 - x0, y1 - y0);

    if (remaining > length) {
      remaining -= length;
      continue;
    }

    const along = length === 0 ? 0 : remaining / length;
    return { x: x0 + (x1 - x0) * along, y: y0 + (y1 - y0) * along };
  }

  return { x: rect.x, y: rect.y };
}

/** The emitter sits just off the top edge, centred — the web's `emitterY = -24`. */
export const LASER_EMITTER_Y = -24;
