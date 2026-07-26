// packages/client-react-native/src/ui/shell/boot/scenes/hologramGeometry.ts
import { BOOT_TELEMETRY_BULLET } from "./bootGlyphs";
import { clamp01, ease, hashRandom } from "./coreGeometry";

/**
 * Pure geometry/timing/copy for `HologramScene` — "HOLO-PROJ 01", the
 * volumetric market core. Ported verbatim (formulas and strings unchanged)
 * from `packages/boot-splash/src/variants/bootHologram.ts`.
 *
 * Kept out of the component so the numbers are unit-testable with vitest, with
 * no Skia or Reanimated involved. Tasks 3-4 draw these; nothing here draws.
 *
 * WORKLET SPLIT — read before adding an export. `craftGridLines` (6b-1) was
 * caught pre-merge because a build-once helper was called per frame from
 * inside a worklet, so the split is recorded per export:
 *
 *   BUILD-ONCE, deliberately UNMARKED (call in React-land, `useMemo`, and
 *   capture the result in the draw closure):
 *     - `hologramColumns`, `hologramHexCells`, `hologramMotes`
 *     - every exported constant
 *
 *   PER-FRAME, worklet-marked:
 *     - everything else
 *
 * PROJECTION. `HOLOGRAM_PERSPECTIVE_K` is 0.26 and there is **no near-plane
 * clamp** — `bootHologram.ts:216` is `1 / (1 + depth * 0.26)` with no floor on
 * the denominator. Build the camera with `bootCameraParams` and leave
 * `minPerspectiveDenom` omitted; see `boot3dCamera.ts` for why defaulting a
 * clamp on would silently diverge from the web at depth.
 *
 * GLYPHS. The web's telemetry line opens with `◉` FISHEYE, which is in NO
 * bundled face — it renders as nothing on iOS, silently. `hologramTelemetry`
 * therefore emits the shared `BOOT_TELEMETRY_BULLET` substitution. The three
 * callout values use `▲`, `σ` and `≡`; all three were checked
 * against the cmap of both bundled JetBrains Mono faces and are present, so
 * they are transcribed as-is.
 */

/** Columns per grid axis — the web's `GRID_SIZE`. The grid is 9x9 = 81. */
export const HOLOGRAM_GRID_SIZE = 9;

/** Y of the emitter pad plane; everything is staged relative to it. */
export const HOLOGRAM_PAD_Y = 0.62;

/** Perspective divisor coefficient. NO clamp — see the header. */
export const HOLOGRAM_PERSPECTIVE_K = 0.26;

/** Fixed camera pitch, radians. */
export const HOLOGRAM_PITCH = 0.46;

/** Projection scale as a fraction of `min(width, height)`. */
export const HOLOGRAM_PROJ_SCALE_FACTOR = 0.27;

/** The web nudges the scene centre up by 10px (`height / 2 - 10`). */
export const HOLOGRAM_CENTER_Y_NUDGE = -10;

/** One market-data column in the assembling 9x9 grid. */
export interface HologramColumn {
  readonly normX: number;
  readonly normZ: number;
  readonly height: number;
  readonly phase: number;
  readonly delay: number;
  readonly scatterX: number;
  readonly scatterY: number;
  readonly scatterZ: number;
}

/** One backdrop hex-field cell, positioned in normalised screen space. */
export interface HologramHexCell {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly phase: number;
}

/** One dust mote rising through the light cone. */
export interface HologramMote {
  readonly angle: number;
  readonly radius: number;
  readonly speed: number;
  readonly offset: number;
}

/** A point in the scene's world space, before projection. */
export interface HologramWorldPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A dust mote's world position plus the alpha it fades through. */
export interface HologramMotePoint extends HologramWorldPoint {
  readonly alpha: number;
}

/** The two gyroscopic rings' current spin angles. */
export interface HologramGyroSpin {
  readonly outer: number;
  readonly inner: number;
}

/** A floating callout panel anchored to one column of the grid. */
export interface HologramCallout {
  readonly gridIndex: number;
  readonly label: string;
  readonly value: string;
  readonly appearAt: number;
}

/**
 * The 81 grid columns. BUILD-ONCE — the coordinates and scatter starts are
 * constant for the mount; only the interpolation between them is per-frame.
 */
export function hologramColumns(): readonly HologramColumn[] {
  const columns: HologramColumn[] = [];
  const half = (HOLOGRAM_GRID_SIZE - 1) / 2;

  for (let gx = 0; gx < HOLOGRAM_GRID_SIZE; gx++) {
    for (let gz = 0; gz < HOLOGRAM_GRID_SIZE; gz++) {
      const cellIndex = gx * HOLOGRAM_GRID_SIZE + gz;

      columns.push({
        normX: (gx - half) / half,
        normZ: (gz - half) / half,
        height: 0.16 + 0.78 * hashRandom(cellIndex * 3 + 1),
        phase: hashRandom(cellIndex * 7 + 2) * 6.283,
        delay: hashRandom(cellIndex * 5 + 3),
        scatterX: (hashRandom(cellIndex * 11 + 4) - 0.5) * 3.4,
        scatterY: -0.5 - hashRandom(cellIndex * 13 + 5) * 1.8,
        scatterZ: (hashRandom(cellIndex * 17 + 6) - 0.5) * 3.4,
      });
    }
  }

  return columns;
}

/** The 16 backdrop hex cells. BUILD-ONCE. */
export function hologramHexCells(): readonly HologramHexCell[] {
  const cells: HologramHexCell[] = [];

  for (let index = 0; index < 16; index++) {
    cells.push({
      x: hashRandom(index * 29 + 9),
      y: hashRandom(index * 31 + 8),
      radius: 8 + hashRandom(index * 37 + 7) * 20,
      phase: hashRandom(index * 41 + 6) * 6.283,
    });
  }

  return cells;
}

/** The 36 dust motes. BUILD-ONCE. */
export function hologramMotes(): readonly HologramMote[] {
  const motes: HologramMote[] = [];

  for (let index = 0; index < 36; index++) {
    motes.push({
      angle: hashRandom(index * 19 + 2) * 6.283,
      radius: 0.15 + hashRandom(index * 23 + 3) * 1.1,
      speed: 0.05 + hashRandom(index * 43 + 4) * 0.16,
      offset: hashRandom(index * 47 + 5),
    });
  }

  return motes;
}

/**
 * The three callout panels, transcribed verbatim.
 *
 * `▲`, `σ` and `≡` are all covered by both bundled JetBrains
 * Mono faces (checked against their cmaps), so no substitution is needed here.
 */
export const HOLOGRAM_CALLOUTS: readonly HologramCallout[] = [
  {
    gridIndex: HOLOGRAM_GRID_SIZE * 1 + 1,
    label: "FX CORE",
    value: "▲ 1.0842",
    appearAt: 0.55,
  },
  {
    gridIndex: HOLOGRAM_GRID_SIZE * 7 + 2,
    label: "RISK GRID",
    value: "σ 12.4",
    appearAt: 0.65,
  },
  {
    gridIndex: HOLOGRAM_GRID_SIZE * 4 + 7,
    label: "ORDER FLOW",
    value: "≡ 48/s",
    appearAt: 0.75,
  },
];

/** One emitter-pad ring. `dash`/`rotationRate` are omitted for the solid pair. */
export interface HologramEmitterRing {
  readonly radius: number;
  readonly y: number;
  readonly alpha: number;
  readonly lineWidth: number;
  readonly dash?: readonly number[];
  readonly rotationRate?: number;
}

/**
 * The emitter-pad rings, **in the web's draw order — which is not radius
 * order**. 1.62 and 1.5 are solid; the dashed 1.74 is drawn last so it layers
 * over them. Sorting these by radius would change the render.
 */
export const EMITTER_RINGS: readonly HologramEmitterRing[] = [
  { radius: 1.62, y: HOLOGRAM_PAD_Y, alpha: 0.5, lineWidth: 1.6 },
  { radius: 1.5, y: HOLOGRAM_PAD_Y, alpha: 0.22, lineWidth: 1 },
  {
    radius: 1.74,
    y: HOLOGRAM_PAD_Y,
    alpha: 0.16,
    lineWidth: 1,
    dash: [3, 6],
    rotationRate: -0.6,
  },
];

/** Tick marks around the emitter pad. */
export const EMITTER_TICK_COUNT = 48;

/** Inner and outer radii of the pad tick marks. */
export const EMITTER_TICK_INNER_RADIUS = 1.52;
export const EMITTER_TICK_OUTER_RADIUS = 1.6;

/** One gyroscopic segmented ring. */
export interface HologramGyroRing {
  readonly radius: number;
  readonly tilt: number;
  readonly spinRate: number;
  readonly alpha: number;
  readonly lineWidth: number;
  readonly useAltAccent: boolean;
}

/** The two counter-rotating gyroscopic rings. */
export const GYRO_RINGS: readonly HologramGyroRing[] = [
  {
    radius: 1.9,
    tilt: 1.05,
    spinRate: 0.7,
    alpha: 0.5,
    lineWidth: 1.3,
    useAltAccent: false,
  },
  {
    radius: 2.05,
    tilt: -0.9,
    spinRate: -0.5,
    alpha: 0.32,
    lineWidth: 1,
    useAltAccent: true,
  },
];

/** Segments per gyro ring, and the arc resolution the web draws each with. */
export const GYRO_SEGMENT_COUNT = 8;
export const GYRO_SEGMENT_STEPS = 10;

/**
 * The light cone, as multiples of the projection scale.
 *
 * Fixed geometry: the web builds this from the pad point and `projScale`
 * alone, with no progress term, so the cone is the same size on the first
 * frame and the last.
 */
export const HOLOGRAM_CONE = {
  padHalfWidth: 1.5,
  topHalfWidth: 0.6,
  topRise: 0.9,
} as const;

/** The scan ring's radius, and the height of its sweep. */
export const SCAN_RING_RADIUS = 1.28;

/** Camera yaw at `elapsedSec` — a slow orbit from a 0.7 rad offset. */
export function hologramYaw(elapsedSec: number): number {
  "worklet";

  return elapsedSec * 0.45 + 0.7;
}

/**
 * Whole-frame hologram alpha.
 *
 * Two terms: a fast shimmer, and a rare hash-driven dropout to 55%. The
 * dropout is what reads as "hologram" rather than "spinning chart" — a port
 * that keeps only the shimmer looks subtly wrong and never fails a test that
 * merely bounds the range.
 */
export function hologramFlicker(elapsedSec: number): number {
  "worklet";

  const shimmer =
    0.86 + 0.14 * Math.sin(elapsedSec * 37 + Math.sin(elapsedSec * 9) * 4);

  if (hashRandom(Math.floor(elapsedSec * 6) + 3) > 0.94) {
    return shimmer * 0.55;
  }

  return shimmer;
}

/** Backdrop hex-cell stroke alpha — a slow breath in a very faint band. */
export function hexCellAlpha(
  cell: HologramHexCell,
  elapsedSec: number,
): number {
  "worklet";

  return 0.045 + 0.045 * Math.sin(elapsedSec * 0.8 + cell.phase);
}

/**
 * How far the ground grid has expanded from the centre, 0→1.
 *
 * Scales the columns' normalised coordinates, so the grid grows outward rather
 * than fading in.
 */
export function groundGridPhase(progress: number): number {
  "worklet";

  return ease((progress - 0.04) / 0.3);
}

/** How far one column has travelled from its scatter start toward home, 0→1. */
export function columnAssemblyPhase(
  column: HologramColumn,
  progress: number,
): number {
  "worklet";

  return ease(clamp01((progress * 1.5 - 0.18 - column.delay * 0.6) / 0.3));
}

/** A column's breathing height at `elapsedSec`. */
export function columnHeight(
  column: HologramColumn,
  elapsedSec: number,
): number {
  "worklet";

  return (
    column.height * (0.88 + 0.12 * Math.sin(elapsedSec * 1.7 + column.phase))
  );
}

/** Tall columns take the alt accent — the web's `column.height > 0.75`. */
export function columnIsHot(column: HologramColumn): boolean {
  "worklet";

  return column.height > 0.75;
}

/**
 * A column's particle position while it is still assembling.
 *
 * `height` is passed in rather than recomputed so the caller's per-frame
 * `columnHeight` result is reused, and never defaulted — a default-parameter
 * position is exactly where the Worklets Babel plugin drops a captured const
 * (#334).
 */
export function columnAssembly(
  column: HologramColumn,
  frac: number,
  height: number,
): HologramWorldPoint {
  "worklet";

  return {
    x: column.scatterX + (column.normX - column.scatterX) * frac,
    y: column.scatterY + (HOLOGRAM_PAD_Y - height - column.scatterY) * frac,
    z: column.scatterZ + (column.normZ - column.scatterZ) * frac,
  };
}

/**
 * How far a column has risen, 0→1.
 *
 * Stays 0 until assembly is 55% done, so a column grows *after* its particle
 * arrives rather than out of the scatter cloud.
 */
export function columnRisePhase(assemblePhase: number): number {
  "worklet";

  return clamp01((assemblePhase - 0.55) / 0.45);
}

/** The vertical scan ring's height — a sawtooth sweeping down from the pad. */
export function scanRingHeight(elapsedSec: number): number {
  "worklet";

  return HOLOGRAM_PAD_Y - ((elapsedSec * 0.45) % 1) * 1.35;
}

/** Current spin angle of each gyroscopic ring. */
export function gyroRingSpin(elapsedSec: number): HologramGyroSpin {
  "worklet";

  return {
    outer: elapsedSec * GYRO_RINGS[0].spinRate,
    inner: elapsedSec * GYRO_RINGS[1].spinRate,
  };
}

/** How far the gyroscopic rings have faded in, 0→1. */
export function gyroRingsPhase(progress: number): number {
  "worklet";

  return ease((progress - 0.35) / 0.3);
}

/** Angle of one emitter-pad tick mark. */
export function emitterTickAngle(tick: number, elapsedSec: number): number {
  "worklet";

  return (tick / EMITTER_TICK_COUNT) * 6.283 + elapsedSec * 0.25;
}

/** Every fourth pad tick is drawn brighter. */
export function emitterTickAlpha(tick: number): number {
  "worklet";

  return tick % 4 === 0 ? 0.5 : 0.2;
}

/**
 * A dust mote's position and alpha at `elapsedSec`.
 *
 * `y` runs from the pad at 0.62 up to -0.68 — negative is UP in this
 * projection — and wraps. Motes fade as they rise.
 */
export function moteRise(
  mote: HologramMote,
  elapsedSec: number,
): HologramMotePoint {
  "worklet";

  const frac = (elapsedSec * mote.speed + mote.offset) % 1;
  const angle = mote.angle + elapsedSec * 0.2;

  return {
    x: Math.cos(angle) * mote.radius,
    y: HOLOGRAM_PAD_Y - frac * 1.3,
    z: Math.sin(angle) * mote.radius,
    alpha: 0.35 * (1 - frac),
  };
}

/** How far one callout panel has faded in, 0→1. */
export function calloutPhase(
  callout: HologramCallout,
  progress: number,
): number {
  "worklet";

  return ease(clamp01((progress - callout.appearAt) / 0.12));
}

/** The four corner telemetry readouts. */
export interface HologramTelemetry {
  readonly title: string;
  readonly particles: string;
  readonly yaw: string;
  readonly assembly: string;
}

/**
 * Corner telemetry.
 *
 * The title opens with `BOOT_TELEMETRY_BULLET`, not the web's `◉`
 * FISHEYE, which no bundled face covers.
 */
export function hologramTelemetry(
  progress: number,
  yaw: number,
): HologramTelemetry {
  "worklet";

  return {
    title: `${BOOT_TELEMETRY_BULLET} HOLO-PROJ 01 · VOLUMETRIC`,
    particles: `PARTICLES ${Math.round(6480 * progress)} / 6480`,
    yaw: `YAW ${((yaw * 57.29) % 360).toFixed(1)}°`,
    assembly: `ASSEMBLY ${Math.round(progress * 100)}%`,
  };
}

/** The status banner's text and whether it takes the alt accent. */
export interface HologramStatus {
  readonly text: string;
  readonly useAltAccent: boolean;
}

/** The three-state status ladder. */
export function hologramStatus(progress: number): HologramStatus {
  "worklet";

  if (progress >= 0.82) {
    return { text: "STRUCTURE STABLE ▸ HANDOFF", useAltAccent: true };
  }

  if (progress >= 0.5) {
    return { text: "RESOLVING DEPTH FIELD", useAltAccent: false };
  }

  return { text: "COMPILING MARKET HOLOGRAM", useAltAccent: false };
}

/** The banner blinks until handoff, then holds solid. */
export function hologramBlinkAlpha(
  progress: number,
  elapsedSec: number,
): number {
  "worklet";

  if (progress >= 0.82) {
    return 1;
  }

  return 0.55 + 0.45 * Math.abs(Math.sin(elapsedSec * 5));
}
