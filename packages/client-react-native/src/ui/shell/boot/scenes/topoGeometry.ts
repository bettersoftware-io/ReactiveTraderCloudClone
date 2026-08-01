// packages/client-react-native/src/ui/shell/boot/scenes/topoGeometry.ts
import { BOOT_TELEMETRY_BULLET } from "./bootGlyphs";
import { clamp01, ease, hashRandom } from "./coreGeometry";

/**
 * Pure geometry/timing/copy for `TopoScene` — "VOL SURFACE · 3DSCAN", a
 * volatility-terrain survey: six gaussian FX-pair peaks rendered as
 * marching-squares contour topography over a 52×36 heightfield, with summit
 * beacons ticking live prices, a route linking the summits and drifting
 * survey motes.
 *
 * Ported verbatim (formulas and strings unchanged) from
 * `packages/boot-splash/src/variants/bootTopo.ts`.
 *
 * WORKLET SPLIT — read before adding an export.
 *
 *   BUILD-ONCE, deliberately UNMARKED:
 *     - `topoHeightfield`, `topoContours`, `topoMeshLines`, `topoMotes`
 *     - `TOPO_PEAKS`, `TOPO_LEVELS`, every constant
 *
 *   PER-FRAME, worklet-marked:
 *     - everything else
 *
 * THE HEIGHTFIELD IS THE REASON THIS FILE EXISTS. `topoHeightfield()` runs
 * `heightAt` over 52 × 36 = **1,872 grid points**, each summing six gaussians,
 * and `topoContours()` then walks that grid for **11 iso levels** — about
 * 20,000 cell evaluations. The web does all of it ONCE, before returning its
 * draw closure. Calling either inside `createPicture` would repeat it every
 * frame at 60 fps: the `craftGridLines` bug (6b-1) at roughly a hundred times
 * the cost. Jest stays green either way, because its mock executes the slow
 * version happily — only a device would show it.
 *
 * PROJECTION. `TOPO_PERSPECTIVE_K` 0.26 **with** a near-plane clamp at
 * `TOPO_MIN_PERSPECTIVE_DENOM` — `bootTopo.ts:381`.
 *
 * PRICE TICKS ARE DERIVED FROM TIME. The web mutates `lastTickIdx`, `val`,
 * `dir` and `flashStart` on each peak every frame. A worklet captures values
 * rather than sharing a live closure, so all four are reconstructed here as
 * pure functions — see `peakTick`. Two first-frame edge cases are documented
 * there where the reconstruction and the web differ by a frame.
 */

/** A volatility peak — one FX pair, as a gaussian bump with a live price. */
export interface TopoPeak {
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly sigma: number;
  readonly pair: string;
  readonly base: number;
  readonly decimals: number;
  readonly step: number;
  readonly revealAt: number;
}

/** The six FX-pair peaks, in the web's order — which is also the route order. */
export const TOPO_PEAKS: readonly TopoPeak[] = [
  {
    x: 0.1,
    z: -0.15,
    height: 0.55,
    sigma: 0.2,
    pair: "EUR/USD",
    base: 1.0917,
    decimals: 4,
    step: 0.0004,
    revealAt: 0.44,
  },
  {
    x: -0.55,
    z: 0.1,
    height: 0.42,
    sigma: 0.16,
    pair: "GBP/USD",
    base: 1.2744,
    decimals: 4,
    step: 0.0005,
    revealAt: 0.495,
  },
  {
    x: 0.55,
    z: 0.25,
    height: 0.38,
    sigma: 0.15,
    pair: "USD/JPY",
    base: 157.32,
    decimals: 2,
    step: 0.05,
    revealAt: 0.55,
  },
  {
    x: -0.15,
    z: 0.45,
    height: 0.3,
    sigma: 0.13,
    pair: "AUD/USD",
    base: 0.6621,
    decimals: 4,
    step: 0.0003,
    revealAt: 0.605,
  },
  {
    x: 0.75,
    z: -0.35,
    height: 0.26,
    sigma: 0.12,
    pair: "EUR/GBP",
    base: 0.8567,
    decimals: 4,
    step: 0.0002,
    revealAt: 0.66,
  },
  {
    x: -0.75,
    z: -0.4,
    height: 0.24,
    sigma: 0.12,
    pair: "USD/CHF",
    base: 0.8842,
    decimals: 4,
    step: 0.0003,
    revealAt: 0.715,
  },
];

/** Heightfield grid resolution and world extent. */
export const TOPO_GRID_COLS = 52;
export const TOPO_GRID_ROWS = 36;
export const TOPO_WORLD_MIN_X = -1.3;
export const TOPO_WORLD_MAX_X = 1.3;
export const TOPO_WORLD_MIN_Z = -1.0;
export const TOPO_WORLD_MAX_Z = 1.0;

/** The survey table's ground plane. */
export const TOPO_GROUND_Y = 0.35;

/** Projection constants. */
export const TOPO_PERSPECTIVE_K = 0.26;
export const TOPO_MIN_PERSPECTIVE_DENOM = 0.4;
export const TOPO_PROJ_SCALE_FACTOR = 0.44;

/** The web drops the scene centre by 10px (`height / 2 + 10`). */
export const TOPO_CENTER_Y_NUDGE = 10;

/** The eleven iso levels the contours are cut at. */
export const TOPO_LEVELS: readonly number[] = Array.from(
  { length: 11 },
  (_, li) => {
    return 0.055 + li * 0.052;
  },
);

/** Contours at or above this index take the alt accent. */
export const TOPO_HOT_LEVEL_INDEX = 8;

const STEP_X: number =
  (TOPO_WORLD_MAX_X - TOPO_WORLD_MIN_X) / (TOPO_GRID_COLS - 1);

const STEP_Z: number =
  (TOPO_WORLD_MAX_Z - TOPO_WORLD_MIN_Z) / (TOPO_GRID_ROWS - 1);

/**
 * Marching-squares edge pairs, keyed by the 4-bit corner mask.
 *
 * Transcribed verbatim. The masks with no entry (0 and 15) are the fully-below
 * and fully-above cells, which emit no segment.
 */
const MARCHING_SQUARES: Record<number, readonly (readonly [number, number])[]> =
  {
    1: [[3, 0]],
    2: [[0, 1]],
    3: [[3, 1]],
    4: [[1, 2]],
    5: [
      [3, 0],
      [1, 2],
    ],
    6: [[0, 2]],
    7: [[3, 2]],
    8: [[2, 3]],
    9: [[0, 2]],
    10: [
      [0, 1],
      [2, 3],
    ],
    11: [[1, 2]],
    12: [[3, 1]],
    13: [[0, 1]],
    14: [[3, 0]],
  };

/**
 * Terrain height at a world coordinate — six gaussians, ripple noise, and an
 * edge falloff that pulls the surface back to zero at the table's rim.
 *
 * PER-FRAME — worklet. `TopoScene` reaches it from three draw sites, so an
 * unmarked version throws `[Worklets] Tried to synchronously call a Remote
 * Function` on any real device. jest is blind to it (the Reanimated mock runs
 * worklets as plain JS), so the simulator is the only witness.
 */
export function topoHeightAt(x: number, z: number): number {
  "worklet";

  let height = 0;

  for (const peak of TOPO_PEAKS) {
    const dx = x - peak.x;
    const dz = z - peak.z;
    height +=
      peak.height *
      Math.exp(-(dx * dx + dz * dz) / (peak.sigma * peak.sigma * 2));
  }

  height +=
    0.045 * Math.sin(3.1 * x + 1.7 * z) +
    0.035 * Math.sin(5.3 * z - 2.2 * x) +
    0.05;

  const fall =
    (1 - (Math.abs(x) / 1.32) ** 4) * (1 - (Math.abs(z) / 1.02) ** 4);

  return Math.max(0, height * Math.max(0, fall));
}

/** The 52×36 heightfield. BUILD-ONCE — see the header. */
export function topoHeightfield(): readonly (readonly number[])[] {
  const heights: number[][] = [];

  for (let i = 0; i < TOPO_GRID_COLS; i++) {
    const column: number[] = [];

    for (let j = 0; j < TOPO_GRID_ROWS; j++) {
      column.push(
        topoHeightAt(
          TOPO_WORLD_MIN_X + i * STEP_X,
          TOPO_WORLD_MIN_Z + j * STEP_Z,
        ),
      );
    }

    heights.push(column);
  }

  return heights;
}

/** One iso level's contour, as flat `[x0, z0, x1, z1, …]` segment pairs. */
export interface TopoContour {
  readonly level: number;
  readonly segments: readonly number[];
}

/** The eleven contour levels. BUILD-ONCE — see the header. */
export function topoContours(
  heights: readonly (readonly number[])[],
): readonly TopoContour[] {
  const contours: TopoContour[] = [];

  for (const level of TOPO_LEVELS) {
    const segments: number[] = [];

    for (let i = 0; i < TOPO_GRID_COLS - 1; i++) {
      for (let j = 0; j < TOPO_GRID_ROWS - 1; j++) {
        const v00 = heights[i][j];
        const v10 = heights[i + 1][j];
        const v01 = heights[i][j + 1];
        const v11 = heights[i + 1][j + 1];
        const bits =
          (v00 > level ? 1 : 0) |
          (v10 > level ? 2 : 0) |
          (v11 > level ? 4 : 0) |
          (v01 > level ? 8 : 0);
        const edges = MARCHING_SQUARES[bits];

        if (edges === undefined) {
          continue;
        }

        const x0 = TOPO_WORLD_MIN_X + i * STEP_X;
        const z0 = TOPO_WORLD_MIN_Z + j * STEP_Z;

        for (const [edgeA, edgeB] of edges) {
          const a = contourEdgePoint(edgeA, level, x0, z0, v00, v10, v01, v11);
          const b = contourEdgePoint(edgeB, level, x0, z0, v00, v10, v01, v11);
          segments.push(a[0], a[1], b[0], b[1]);
        }
      }
    }

    contours.push({ level, segments });
  }

  return contours;
}

/** Where a contour crosses one edge of a cell, by linear interpolation. */
function contourEdgePoint(
  edgeId: number,
  level: number,
  x0: number,
  z0: number,
  v00: number,
  v10: number,
  v01: number,
  v11: number,
): readonly [number, number] {
  if (edgeId === 0) {
    return [x0 + clamp01((level - v00) / (v10 - v00 || 1e-9)) * STEP_X, z0];
  }

  if (edgeId === 1) {
    return [
      x0 + STEP_X,
      z0 + clamp01((level - v10) / (v11 - v10 || 1e-9)) * STEP_Z,
    ];
  }

  if (edgeId === 2) {
    return [
      x0 + clamp01((level - v01) / (v11 - v01 || 1e-9)) * STEP_X,
      z0 + STEP_Z,
    ];
  }

  return [x0, z0 + clamp01((level - v00) / (v01 - v00 || 1e-9)) * STEP_Z];
}

/** One vertex of the sparse wireframe mesh: world x, height, world z. */
export type TopoMeshVertex = readonly [number, number, number];

/** The sparse wireframe mesh — every 7th row and every 8th column. BUILD-ONCE. */
export function topoMeshLines(
  heights: readonly (readonly number[])[],
): readonly (readonly TopoMeshVertex[])[] {
  const lines: TopoMeshVertex[][] = [];

  for (let j = 0; j < TOPO_GRID_ROWS; j += 7) {
    const row: TopoMeshVertex[] = [];

    for (let i = 0; i < TOPO_GRID_COLS; i += 2) {
      row.push([
        TOPO_WORLD_MIN_X + i * STEP_X,
        heights[i][j],
        TOPO_WORLD_MIN_Z + j * STEP_Z,
      ]);
    }

    lines.push(row);
  }

  for (let i = 0; i < TOPO_GRID_COLS; i += 8) {
    const column: TopoMeshVertex[] = [];

    for (let j = 0; j < TOPO_GRID_ROWS; j += 2) {
      column.push([
        TOPO_WORLD_MIN_X + i * STEP_X,
        heights[i][j],
        TOPO_WORLD_MIN_Z + j * STEP_Z,
      ]);
    }

    lines.push(column);
  }

  return lines;
}

/** A drifting survey mote, anchored near one of the peaks. */
export interface TopoMote {
  readonly x: number;
  readonly z: number;
  readonly phase: number;
  readonly speed: number;
}

/** The 26 survey motes. BUILD-ONCE. */
export function topoMotes(): readonly TopoMote[] {
  const motes: TopoMote[] = [];

  for (let i = 0; i < 26; i++) {
    const peak = TOPO_PEAKS[i % 6];

    motes.push({
      x: peak.x + (hashRandom(i * 7 + 2) - 0.5) * 0.5,
      z: peak.z + (hashRandom(i * 11 + 3) - 0.5) * 0.5,
      phase: hashRandom(i * 13 + 4),
      speed: 0.06 + hashRandom(i * 17 + 5) * 0.1,
    });
  }

  return motes;
}

/** Camera yaw — a steady orbit plus the pointer/gyro seam. */
export function topoYaw(elapsedSec: number, driftX: number): number {
  "worklet";

  return 0.5 + elapsedSec * 0.16 + driftX * 0.35;
}

/** Camera pitch — a slow sway plus the pointer/gyro seam. */
export function topoPitch(elapsedSec: number, driftY: number): number {
  "worklet";

  return 0.55 + 0.05 * Math.sin(elapsedSec * 0.3) + driftY * 0.15;
}

/** How far the terrain has risen out of the table, 0→1. */
export function topoRise(progress: number): number {
  "worklet";

  return ease(progress / 0.4);
}

/** The whole-frame flicker — a fast shimmer plus a rare dropout to 55%. */
export function topoFlicker(elapsedSec: number): number {
  "worklet";

  const shimmer =
    0.88 + 0.12 * Math.sin(elapsedSec * 35 + Math.sin(elapsedSec * 8) * 4);

  if (hashRandom(Math.floor(elapsedSec * 6) + 11) > 0.94) {
    return shimmer * 0.55;
  }

  return shimmer;
}

/** How far one contour level has been revealed, bottom-up. */
export function contourPhase(levelIndex: number, progress: number): number {
  "worklet";

  return ease((progress - 0.06 - levelIndex * 0.032) / 0.1);
}

/** How far the route linking the summits has drawn in, 0→1. */
export function routePhase(progress: number): number {
  "worklet";

  return ease((progress - 0.62) / 0.15);
}

/** How far one summit beacon has risen, 0→1. */
export function beaconPhase(peak: TopoPeak, progress: number): number {
  "worklet";

  return ease((progress - peak.revealAt) / 0.12);
}

/** A mote's drift fraction, 0→1, wrapping. */
export function moteDrift(mote: TopoMote, elapsedSec: number): number {
  "worklet";

  return (elapsedSec * mote.speed + mote.phase) % 1;
}

/** One peak's live price at this instant. */
export interface TopoTick {
  readonly value: number;
  readonly rising: boolean;
  readonly flash: number;
}

/** The tick index for a peak at `elapsedSec`. */
function tickIndex(peak: TopoPeak, elapsedSec: number): number {
  "worklet";

  return Math.floor(elapsedSec / 0.3 + hashRandom(peak.base * 97) * 7);
}

/** The price a peak shows on tick `index`. */
function tickValue(peak: TopoPeak, index: number): number {
  "worklet";

  return (
    peak.base +
    (hashRandom(index * 7.3 + peak.base * 31) - 0.5) * peak.step * 14
  );
}

/**
 * A peak's ticking price, reconstructed from time alone.
 *
 * The web mutates `lastTickIdx`/`val`/`dir`/`flashStart` on the peak object
 * every frame. All four are derivable:
 *
 *   - the tick index is a pure function of `elapsedSec` and the peak's seed;
 *   - the value is a pure function of the tick index;
 *   - the direction compares this tick's value with the previous tick's;
 *   - the flash decays from the instant the index changed, which is exactly
 *     `(index - seedOffset) * 0.3`.
 *
 * TWO EDGE CASES where this differs from the web by at most one frame, both
 * deliberate. (1) The web compares the FIRST tick against the peak's `base`
 * rather than a previous tick, because `val` is initialised to `base`; this
 * reproduces that by comparing against `base` at the initial index. (2) The
 * web stamps `flashStart` with the frame it noticed the change, which is a
 * frame or so after the true crossing; using the exact crossing makes the
 * flash reproducible, which is what a pinned golden needs.
 */
export function peakTick(peak: TopoPeak, elapsedSec: number): TopoTick {
  "worklet";

  const seedOffset = hashRandom(peak.base * 97) * 7;
  const index = tickIndex(peak, elapsedSec);
  const value = tickValue(peak, index);
  const initialIndex = Math.floor(seedOffset);
  const previous =
    index <= initialIndex ? peak.base : tickValue(peak, index - 1);
  const crossedAt = (index - seedOffset) * 0.3;

  return {
    value,
    rising: value >= previous,
    flash: clamp01(1 - (elapsedSec - crossedAt) / 0.22),
  };
}

/** A peak's price, formatted to its own precision. */
export function peakPriceText(peak: TopoPeak, value: number): string {
  "worklet";

  return value.toFixed(peak.decimals);
}

/** The corner telemetry and legend readouts. */
export interface TopoTelemetry {
  readonly title: string;
  readonly grid: string;
  readonly yaw: string;
  readonly peaks: string;
  readonly footer: string;
}

/**
 * Corner telemetry.
 *
 * The title opens with `BOOT_TELEMETRY_BULLET`, not the web's `◉`
 * FISHEYE, which no bundled face covers. `σ` U+03C3 in the grid line IS
 * covered by both bundled faces (checked against their cmaps).
 */
export function topoTelemetry(progress: number, yaw: number): TopoTelemetry {
  "worklet";

  return {
    title: `${BOOT_TELEMETRY_BULLET} VOL SURFACE · 3DSCAN`,
    grid: "GRID RZ_5.19.24 · σ ALTITUDE",
    yaw: `YAW ${((yaw * 57.29) % 360).toFixed(1)}°`,
    peaks: `PEAKS 6 · FEED ${progress > 0.5 ? "LIVE" : "SYNC"}`,
    footer: ".// MAP/VOLSCAN",
  };
}

/** Zero-pad to two digits. Verbatim from the web's `padTwo`. */
function padTwo(value: number): string {
  "worklet";

  return String(value).padStart(2, "0");
}

/**
 * The wall-clock stamp the web prints bottom-left.
 *
 * Pure, taking the time in rather than reading a clock, for two reasons: a
 * worklet must not call `new Date()`, and a live clock makes a pinned visual
 * golden unreproducible — this repo already dropped `credit/rfq-tiles-empty`
 * for exactly that. `TopoScene` samples the clock once in React-land; the
 * visual harness must pin it (see the scene header).
 */
export function topoTimestamp(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  seconds: number,
): string {
  "worklet";

  return `${year}-${padTwo(month)}-${padTwo(day)} ${padTwo(hours)}:${padTwo(minutes)}:${padTwo(seconds)}`;
}

/** The status banner's text and whether it takes the alt accent. */
export interface TopoStatus {
  readonly text: string;
  readonly useAltAccent: boolean;
}

/** The three-state status ladder. */
export function topoStatus(progress: number): TopoStatus {
  "worklet";

  if (progress >= 0.75) {
    return { text: "PRICE FEED LIVE ▸ HANDOFF", useAltAccent: true };
  }

  if (progress >= 0.44) {
    return { text: "RESOLVING SUMMITS", useAltAccent: false };
  }

  return { text: "SCANNING VOLATILITY TERRAIN", useAltAccent: false };
}

/** The banner blinks until the summits resolve, then holds solid. */
export function topoBlinkAlpha(progress: number, elapsedSec: number): number {
  "worklet";

  if (progress >= 0.44) {
    return 1;
  }

  return 0.55 + 0.45 * Math.abs(Math.sin(elapsedSec * 5));
}
