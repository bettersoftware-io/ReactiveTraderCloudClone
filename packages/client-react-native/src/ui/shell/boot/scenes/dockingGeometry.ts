// packages/client-react-native/src/ui/shell/boot/scenes/dockingGeometry.ts
import { clamp01, ease } from "#/ui/shell/boot/scenes/coreGeometry";

/**
 * Pure geometry/timing helpers for `DockingScene` — the "escort craft
 * lock-on" boot scene. Kept out of the component so every number/string this
 * scene draws is directly unit-testable with vitest, no Skia or Reanimated
 * involved (same split as `coreGeometry.ts`/`laserGeometry.ts`).
 *
 * Ported verbatim (formulas and design constants unchanged) from
 * `drawBootDocking`, `packages/boot-splash/src/bootCanvas.ts` lines 459-1021.
 * This is a full, non-partial port — `docking` is 2D/screen-space only (no
 * `project3d` call anywhere in the source), so unlike `CoreScene`/`LaserScene`
 * it has no deferred-element list.
 *
 * Text-heavy cosmetic gap: this is the most text-dense boot scene (~20
 * distinct readouts). Every one renders at regular weight (Skia has no bundled
 * bold face — see the repo-wide constraint in the phase-6b plan), including
 * the two the web sets `bold 18px` (the RANGE / RANGE RATE figures) and the
 * `bold 13px` status banner (`dockingStatus`'s `▸ TEXT ◂`). This is the single
 * largest cosmetic gap in this phase; the draw shell (Task 8/9) should repeat
 * this note where it builds those two labels.
 *
 * Worklet-reachability: every function this module exports that Tasks 8/9
 * call from inside the per-frame `createPicture` recorder carries `"worklet"`
 * (transitively, matching `ease`/`clamp01` imported from `coreGeometry.ts`).
 * The exceptions — geometry whose *shape* depends only on viewport size or a
 * fixed unit radius, meant to be built once in a `useMemo` and only
 * translated/scaled per frame (docs/performance.md) — are `corridorLines`,
 * `craftGridLines` and `scanlineOffsets`, plus the plain data constants
 * (`CRAFT_BODY_RECTS`, `RETICLE_SPEC`, the `LOCK_*`/`CROSSHAIR_*` tables):
 * none of those are functions reached from a worklet, so none needs the
 * directive.
 *
 * Two deliberate deviations from a literal transliteration, both driven by
 * this task's own prescribed test (`dockingGeometry.test.ts`'s Step 1, fixed
 * by the plan):
 *   - `padTwo` takes the magnitude *before* flooring (`floor(abs(x))`), not
 *     the web's `abs(floor(x))`. The two are identical for every actual call
 *     site in this scene (all integers, or `elapsedSec`-derived values that
 *     are never negative), so this only changes behaviour for a negative
 *     fractional input no real call site produces — but the plan's own test
 *     (`padTwo(-7.9)` → `"07"`) pins the magnitude-first contract, so that's
 *     what ships.
 *   - `dockingTelemetry` returns `roll`/`thrust` alongside the web's
 *     `range`/`closure`/`bearing`/`az`/`el`/`dX`/`dY`/`dZ`/`timecode` set. The
 *     web computes `roll`/`thrust` inline inside the "ALIGN" corner label
 *     (bootCanvas.ts:966-967) rather than in the shared telemetry const, but
 *     `dockingLabels(telemetry)` takes only the telemetry object as its
 *     single argument (per this task's table) and must render that ALIGN
 *     block — so telemetry is the one place left to carry them.
 */

// --- backdrop: wash, vignette, scanlines (bootCanvas.ts:483-501) ----------

/** Flat backdrop wash painted before the vignette — verbatim literal, not a
 * theme token (same idiom as `laserGeometry.ts`'s `LASER_WASH`). */
export const DOCKING_WASH = "rgba(0,2,4,0.64)";

/** Radial vignette gradient stops (`bootCanvas.ts:485-496`): inner/outer
 * radius factors are fractions of `min`/`max(width, height)`; the centre
 * stop is fully transparent, so only the outer alpha is a design constant. */
export const VIGNETTE_INNER_FACTOR = 0.18;
export const VIGNETTE_OUTER_FACTOR = 0.62;
export const VIGNETTE_OUTER_ALPHA = 0.55;

/** Horizontal scanline overlay pitch/alpha (`bootCanvas.ts:497-501`).
 * `SCANLINE_PITCH` is not exported: only `scanlineOffsets` below (which is
 * exported) needs it. */
const SCANLINE_PITCH = 3;
export const SCANLINE_ALPHA = 0.035;

/** Y-offsets for the scanline overlay, built once per viewport height — the
 * shape depends only on `height`, so it must never be rebuilt per frame
 * (docs/performance.md), same discipline as `laserGeometry.ts`'s `gridPath`. */
export function scanlineOffsets(height: number): readonly number[] {
  const offsets: number[] = [];

  for (let y = 0; y < height; y += SCANLINE_PITCH) {
    offsets.push(y);
  }

  return offsets;
}

// --- camera shake (bootCanvas.ts:503-508) ----------------------------------

/** A 2-D pixel offset — shared shape for every offset this module returns. */
export interface DockingOffset {
  readonly x: number;
  readonly y: number;
}

/** Camera shake: amplitude decays from 1.22 (boot start) to 0.22 (boot end)
 * — never fully settles, matching the web's `(1 - easedProgress) * 1 + 0.22`. */
export function dockingShake(
  elapsedSec: number,
  easedProgress: number,
): DockingOffset {
  "worklet";
  const shake = (1 - easedProgress) * 1.0 + 0.22;
  return {
    x:
      (Math.sin(elapsedSec * 9) * 1.4 + Math.sin(elapsedSec * 17) * 0.7) *
      shake,
    y:
      (Math.cos(elapsedSec * 7) * 1.1 + Math.sin(elapsedSec * 23) * 0.5) *
      shake,
  };
}

// --- perspective corridor + rings (bootCanvas.ts:514-550) ------------------

/** One line segment of the converging perspective corridor. */
export interface CorridorLine {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** 13 vertical anchors (`i` from -6 to 6) and 9 horizontal anchors (`i` from
 * -4 to 4), each contributing two segments converging on centre — static per
 * viewport size, built once in a `useMemo` and drawn under the live shake
 * translation (not re-derived per frame). */
export function corridorLines(
  width: number,
  height: number,
): readonly CorridorLine[] {
  const centerX = width / 2;
  const centerY = height / 2;
  const lines: CorridorLine[] = [];

  for (let i = -6; i <= 6; i++) {
    const ex = centerX + i * (width / 12);
    lines.push({ x0: ex, y0: 0, x1: centerX, y1: centerY });
    lines.push({ x0: ex, y0: height, x1: centerX, y1: centerY });
  }

  for (let i = -4; i <= 4; i++) {
    const ey = centerY + i * (height / 8);
    lines.push({ x0: 0, y0: ey, x1: centerX, y1: centerY });
    lines.push({ x0: width, y0: ey, x1: centerX, y1: centerY });
  }

  return lines;
}

/** Concentric perspective rings, shake-tracked like the corridor lines —
 * radii are `ring * min(width, height) * DOCKING_RING_FACTOR` for
 * `ring` 1..`DOCKING_RING_COUNT`. */
export const DOCKING_RING_COUNT = 5;
export const DOCKING_RING_FACTOR = 0.08;
export const DOCKING_RING_ALPHA = 0.16;

// --- HUD grid (bootCanvas.ts:553-572) ---------------------------------------

/** HUD grid pitch. Floored at 1px: on a zero-width canvas (hidden panel,
 * jsdom) a 0 step would never advance the loop that consumes this — an
 * infinite loop, not just a wasted frame. */
export function hudGridStep(width: number): number {
  return Math.max(1, Math.round(width / 16));
}

// --- target + craft (bootCanvas.ts:574-602) ---------------------------------

/** The lock-on target's screen position: viewport centre plus camera shake
 * plus a settling wobble that fades out as the boot eases in. */
export function dockingTarget(
  elapsedSec: number,
  easedProgress: number,
  centerX: number,
  centerY: number,
): DockingOffset {
  "worklet";
  const wobble = 1 - easedProgress;
  const shake = dockingShake(elapsedSec, easedProgress);
  return {
    x: centerX + shake.x + Math.sin(elapsedSec * 1.3) * 6 * wobble,
    y: centerY + shake.y + Math.cos(elapsedSec * 1.1) * 5 * wobble,
  };
}

/** The escort craft's on-screen radius: grows from 12px to 104px across the
 * boot. Every craft/reticle dimension below is a multiple of this value. */
export function craftRadius(easedProgress: number): number {
  "worklet";
  return 12 + easedProgress * 92;
}

/** One rectangle, expressed as multiples of the live craft radius (not
 * pixels) — the caller scales by the current `craftRadius(...)` at draw
 * time, so this table never needs rebuilding as the craft grows. Not
 * exported: only used as a field type of `CraftBodyRectFactors` below, which
 * IS exported (and reachable via `CRAFT_BODY_RECTS`'s own export). */
interface CraftRectFactor {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface CraftBodyRectFactors {
  readonly hull: CraftRectFactor;
  readonly podLeft: CraftRectFactor;
  readonly podRight: CraftRectFactor;
}

/** The craft's hull slab and two side pods (`bootCanvas.ts:581-602`) — a
 * fixed unit shape, hence a plain constant rather than a function. */
export const CRAFT_BODY_RECTS: CraftBodyRectFactors = {
  hull: { x: -3.6, y: -1.6, w: 7.2, h: 3.2 },
  podLeft: { x: -3.4, y: -0.55, w: 0.95, h: 1.1 },
  podRight: { x: 2.45, y: -0.55, w: 0.95, h: 1.1 },
};

/** One line segment of the craft's internal grid, in the same local (craft-
 * centred) space as `CRAFT_BODY_RECTS`. Not exported: only used as a field
 * type of `CraftGridLines` below, which IS exported (the return type of the
 * exported `craftGridLines`). */
interface CraftLine {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface CraftGridLines {
  readonly struts: readonly CraftLine[];
  readonly rails: readonly CraftLine[];
}

/** The craft's 7 vertical struts and 3 horizontal rails, scaled to a given
 * radius — a pure function of `radius` alone (no time dependency), so it is
 * a "static per-size" builder in the same sense as `corridorLines`: call it
 * once (e.g. in a `useMemo`) rather than rebuilding it every frame. */
export function craftGridLines(radius: number): CraftGridLines {
  const struts: CraftLine[] = [];

  for (let i = -3; i <= 3; i++) {
    const x = i * radius * 1.15;
    struts.push({ x0: x, y0: -radius * 1.6, x1: x, y1: radius * 1.6 });
  }

  const rails: CraftLine[] = [];

  for (let i = -1; i <= 1; i++) {
    const y = i * radius * 0.95;
    rails.push({ x0: -radius * 3.6, y0: y, x1: radius * 3.6, y1: y });
  }

  return { struts, rails };
}

// --- reticle (bootCanvas.ts:604-695) ----------------------------------------

/** One ring's radius/alpha/stroke-width, radius as a multiple of the craft
 * radius. Not exported, along with the other `Reticle*Spec` field types
 * below: only used inside `ReticleSpec`, which IS exported (reachable via
 * `RETICLE_SPEC`'s own export). */
interface ReticleRingSpec {
  readonly radiusFactor: number;
  readonly alpha: number;
  readonly lineWidth: number;
}

interface ReticleSpokeSpec {
  readonly angle: number;
  readonly outerFactor: number;
  readonly alpha: number;
}

interface ReticleAngleSpec {
  readonly angle: number;
}

function buildReticleSpokes(): readonly ReticleSpokeSpec[] {
  const spokes: ReticleSpokeSpec[] = [];

  for (let i = 0; i < 36; i++) {
    const bright = i % 3 === 0;
    spokes.push({
      angle: (i / 36) * Math.PI * 2,
      outerFactor: bright ? 1.32 : 1.24,
      alpha: bright ? 0.6 : 0.28,
    });
  }

  return spokes;
}

function buildAngleTable(
  count: number,
  offset: number,
): readonly ReticleAngleSpec[] {
  const angles: ReticleAngleSpec[] = [];

  for (let i = 0; i < count; i++) {
    angles.push({ angle: (i / count) * Math.PI * 2 + offset });
  }

  return angles;
}

export interface ReticleSpec {
  /** Primary hoop, `radius * 1.15`. */
  readonly hoopInner: ReticleRingSpec;
  /** Outer hoop, `radius * 1.34`. */
  readonly hoopOuter: ReticleRingSpec;
  /** Shared inner anchor for every spoke — same radius as `hoopInner`. */
  readonly spokeInnerFactor: number;
  readonly spokes: readonly ReticleSpokeSpec[];
  /** The bright inner ring the spokes terminate through, `radius * 0.84`. */
  readonly innerRing: ReticleRingSpec;
  /** The 12 pip dots sit on `innerRing`'s radius. */
  readonly pipRadiusFactor: number;
  readonly pipAlpha: number;
  readonly pips: readonly ReticleAngleSpec[];
  readonly vaneOuterHalfWidthFactor: number;
  readonly vaneOuterYFactor: number;
  readonly vaneInnerHalfWidthFactor: number;
  readonly vaneInnerYFactor: number;
  readonly vaneFillAlpha: number;
  readonly vaneStrokeAlpha: number;
  readonly vaneLineWidth: number;
  readonly vanes: readonly ReticleAngleSpec[];
  /** `radius * 0.5` ring. */
  readonly crosshairOuter: ReticleRingSpec;
  /** `radius * 0.28` ring. */
  readonly crosshairInner: ReticleRingSpec;
  readonly crosshairTickAlpha: number;
  /** 4 radial ticks connecting `crosshairInner` to `crosshairOuter`. */
  readonly crosshairTicks: readonly ReticleAngleSpec[];
  readonly hubFactor: number;
  readonly hubAlpha: number;
}

/** The full lock-on reticle: hoop, 36 spokes, inner ring + 12 pips, 4 vanes,
 * crosshair rings + 4 ticks, hub dot — verbatim from `bootCanvas.ts:604-695`.
 * Every dimension is a multiple of the live `craftRadius(...)`, so this is a
 * plain constant, not a per-frame computation. */
export const RETICLE_SPEC: ReticleSpec = {
  hoopInner: { radiusFactor: 1.15, alpha: 0.85, lineWidth: 2.4 },
  hoopOuter: { radiusFactor: 1.34, alpha: 0.4, lineWidth: 1 },
  spokeInnerFactor: 1.15,
  spokes: buildReticleSpokes(),
  innerRing: { radiusFactor: 0.84, alpha: 0.6, lineWidth: 1.6 },
  pipRadiusFactor: 0.045,
  pipAlpha: 0.5,
  pips: buildAngleTable(12, 0),
  vaneOuterHalfWidthFactor: 0.22,
  vaneOuterYFactor: -0.64,
  vaneInnerHalfWidthFactor: 0.12,
  vaneInnerYFactor: -0.34,
  vaneFillAlpha: 0.1,
  vaneStrokeAlpha: 0.55,
  vaneLineWidth: 1.4,
  vanes: buildAngleTable(4, Math.PI / 4),
  crosshairOuter: { radiusFactor: 0.5, alpha: 0.7, lineWidth: 1.4 },
  crosshairInner: { radiusFactor: 0.28, alpha: 0.45, lineWidth: 1.4 },
  crosshairTickAlpha: 0.4,
  crosshairTicks: buildAngleTable(4, 0),
  hubFactor: 0.06,
  hubAlpha: 0.9,
};

// --- buy-coloured marker + range dial (bootCanvas.ts:696-716) --------------

/** The buy-coloured crosshair marker's drift offset from the craft centre
 * (`bootCanvas.ts:696-701`). */
export function markerOffset(
  elapsedSec: number,
  wobble: number,
  radius: number,
  width: number,
  height: number,
): DockingOffset {
  "worklet";
  return {
    x:
      -width * 0.05 * wobble +
      Math.sin(elapsedSec * 1.1) * radius * 0.5 * wobble,
    y:
      -height * 0.05 * wobble +
      Math.cos(elapsedSec * 0.9) * radius * 0.45 * wobble,
  };
}

/** Range-dial radius factor: `min(width, height) * RANGE_RADIUS_FACTOR`. */
export const RANGE_RADIUS_FACTOR = 0.36;

// --- padding + timecode (bootCanvas.ts:96-99, 925) --------------------------

/** Zero-pad a number's magnitude to (at least) two digits. See the file
 * header for why this takes the magnitude before flooring, not after. */
export function padTwo(value: number): string {
  "worklet";
  return String(Math.floor(Math.abs(value))).padStart(2, "0");
}

/** `mm:ss:cc` timecode from elapsed seconds. */
export function dockingTimecode(elapsedSec: number): string {
  "worklet";
  return `${padTwo(elapsedSec / 60)}:${padTwo(elapsedSec % 60)}:${padTwo((elapsedSec * 100) % 100)}`;
}

// --- telemetry (bootCanvas.ts:914-925, plus roll/thrust from 966-967) ------

export interface DockingTelemetry {
  readonly range: number;
  readonly closure: number;
  readonly bearing: string;
  readonly az: string;
  readonly el: string;
  readonly dX: string;
  readonly dY: string;
  readonly dZ: string;
  readonly roll: string;
  readonly thrust: number;
  readonly timecode: string;
}

/** Every corner-readout number/string the scene needs — no drawing, just
 * values. See the file header for why `roll`/`thrust` ride along here even
 * though the web computes them inline at the ALIGN label call site. */
export function dockingTelemetry(
  elapsedSec: number,
  progress: number,
  targetX: number,
  targetY: number,
  width: number,
  height: number,
): DockingTelemetry {
  "worklet";
  const easedProgress = ease(progress);
  const centerX = width / 2;
  const centerY = height / 2;
  const wobble = 1 - easedProgress;
  const range = Math.max(0, Math.round(4820 * (1 - easedProgress)));
  const closure = Math.max(
    0,
    Math.round((58 + 22 * Math.sin(elapsedSec * 2)) * (1 - progress) + 3),
  );
  return {
    range,
    closure,
    bearing: (271.4 + Math.sin(elapsedSec * 0.7) * 0.6).toFixed(1),
    az: (Math.sin(elapsedSec * 0.9) * 2.4 * wobble).toFixed(2),
    el: (Math.cos(elapsedSec * 0.8) * 1.8 * wobble).toFixed(2),
    dX: (((targetX - centerX) / width) * 100).toFixed(2),
    dY: (((targetY - centerY) / height) * 100).toFixed(2),
    dZ: (range / 100).toFixed(2),
    roll: (Math.sin(elapsedSec * 1.7) * 1.2).toFixed(1),
    thrust: Math.round(8 + 12 * (1 - progress)),
    timecode: dockingTimecode(elapsedSec),
  };
}

// --- attitude readouts (bootCanvas.ts:730-772) ------------------------------

export interface AttitudeReadouts {
  /** Left column, top-to-bottom: pitch, yaw, roll — the "P Y R" block. */
  readonly pyr: readonly [string, string, string];
  /** Right column, top row — the "PITCH" angle. */
  readonly pitchAngle: string;
  /** Right column, bottom row — the pitch rate, `°/m` suffixed. */
  readonly pitchRate: string;
}

export function attitudeReadouts(
  elapsedSec: number,
  wobble: number,
): AttitudeReadouts {
  "worklet";
  return {
    pyr: [
      `${(Math.sin(elapsedSec * 0.6) * 3.1 * wobble).toFixed(1)}°`,
      `${(Math.cos(elapsedSec * 0.5) * 2.3 * wobble).toFixed(1)}°`,
      `${(Math.sin(elapsedSec * 0.4) * 0.6 * wobble).toFixed(1)}°`,
    ],
    pitchAngle: `${(Math.sin(elapsedSec * 0.5) * 0.1).toFixed(1)}°`,
    pitchRate: `${(Math.sin(elapsedSec * 0.7) * 0.6 * wobble).toFixed(1)}°/m`,
  };
}

// --- lock box (bootCanvas.ts:802-840) ---------------------------------------

/** Shared colour-role tag across the docking scene's status-driven elements
 * — the draw site (Task 8/9) owns resolving each role to an actual theme
 * token (`theme.accentPrimary` / `theme.accent2` / `theme.accentPositive` /
 * `theme.accentNegative`), per the repo-wide "no hardcoded colours" rule. */
export type DockingColorRole = "primary" | "alt" | "positive" | "negative";

/** 0..1 lock-acquisition fraction: opens at 18% of boot progress, completes
 * by 68%. */
export function lockPhase(progress: number): number {
  "worklet";
  return ease(clamp01((progress - 0.18) / 0.5));
}

/** The lock box's half-extent in pixels: starts wide (loosely searching) and
 * closes in to `craftRadius * 1.45` as `lockPhase` completes. */
export function lockBoxSize(
  currentLockPhase: number,
  currentCraftRadius: number,
  minDim: number,
): number {
  "worklet";
  return currentCraftRadius * 1.45 + (1 - currentLockPhase) * minDim * 0.18;
}

/** The lock reticle only blinks while still acquiring (`progress < 0.25`);
 * once tracking starts it holds fully opaque. */
export function lockBlink(elapsedSec: number, progress: number): number {
  "worklet";

  if (progress >= 0.25) {
    return 1;
  }

  return 0.4 + 0.6 * Math.abs(Math.sin(elapsedSec * 9));
}

/** The lock box/callout swap from the primary accent to the alt accent past
 * the halfway point of the boot. */
export function lockColorRole(progress: number): DockingColorRole {
  "worklet";

  if (progress > 0.55) {
    return "alt";
  }

  return "primary";
}

/** Dashed tracking ring around the lock box: only drawn while `progress` is
 * below this threshold, spinning at `LOCK_DASH_SPIN` rad/s. */
export const LOCK_DASH_INTERVALS: readonly [number, number] = [8, 7];
export const LOCK_DASH_SPIN = 1.4;
export const LOCK_DASH_UNTIL = 0.6;

// --- lock callout (bootCanvas.ts:842-857) -----------------------------------

export const LOCK_CALLOUT_TEXT = "AC-417 ▸ EUR/USD ESCORT";
/** Elbow line: `(targetX + lockBox, targetY - lockBox)` →
 * `(+ELBOW_DX, +ELBOW_DY)` → `(+ARM_DX, +ELBOW_DY)`. */
export const LOCK_CALLOUT_ELBOW_DX = 34;
export const LOCK_CALLOUT_ELBOW_DY = -24;
export const LOCK_CALLOUT_ARM_DX = 200;
/** Text baseline offset from the same `(targetX + lockBox, targetY -
 * lockBox)` anchor. */
export const LOCK_CALLOUT_TEXT_DX = 40;
export const LOCK_CALLOUT_TEXT_DY = -28;

// --- centre crosshair (bootCanvas.ts:867-883) -------------------------------

export const CROSSHAIR_GAP = 14;
export const CROSSHAIR_ARM = 46;
export const CROSSHAIR_HUB_R = 8;

// --- pip ladder (bootCanvas.ts:884-906) -------------------------------------

/** Not exported: only used as a field type of `PipLadder` below, which IS
 * exported (the return type of the exported `pipLadder`). */
interface PipTick {
  /** Y offset from the ladder's own (bobbing) origin. */
  readonly y: number;
  readonly label: string;
}

export interface PipLadder {
  /** The whole ladder's Y offset from screen centre — bobs over time. */
  readonly offsetY: number;
  /** 4 ticks (`pip` -2, -1, 1, 2 — 0 is skipped, it's the crosshair). */
  readonly ticks: readonly PipTick[];
}

export function pipLadder(elapsedSec: number): PipLadder {
  "worklet";
  const ticks: PipTick[] = [];

  for (let pip = -2; pip <= 2; pip++) {
    if (pip === 0) {
      continue;
    }

    ticks.push({ y: pip * 46, label: padTwo(pip * 5) });
  }

  return { offsetY: Math.sin(elapsedSec * 0.8) * 10, ticks };
}

// --- scan sweep (bootCanvas.ts:907-913) -------------------------------------

export const SCAN_BAND_HALF = 30;
export const SCAN_BAND_ALPHA = 0.1;

/** The horizontal scan band's Y position: wraps down the viewport once every
 * `1 / 0.35` seconds. */
export function scanSweepY(elapsedSec: number, height: number): number {
  "worklet";
  return ((elapsedSec * 0.35) % 1) * height;
}

// --- corner labels (bootCanvas.ts:940-968) ----------------------------------

/** Not exported: only used as a field type of `DockingLabels` below, which IS
 * exported (the return type of the exported `dockingLabels`). */
interface DockingLabelBlock {
  readonly lines: readonly string[];
  readonly colorRole: DockingColorRole;
}

export interface DockingLabels {
  readonly topLeft: DockingLabelBlock;
  /** The blinking "● REC" indicator, sell/negative-coloured. */
  readonly rec: DockingLabelBlock;
  readonly topRight: DockingLabelBlock;
  readonly topRightAlt: DockingLabelBlock;
  readonly bottomRight: DockingLabelBlock;
  readonly bottomLeft: DockingLabelBlock;
}

/** The four corner telemetry blocks (plus the standalone REC line) — string
 * arrays only, no drawing. */
export function dockingLabels(telemetry: DockingTelemetry): DockingLabels {
  "worklet";
  return {
    topLeft: {
      lines: [
        "◉ CAM-04  DOCK BAY 07",
        "GIMBAL TRACK · AUTO",
        `TC ${telemetry.timecode}`,
      ],
      colorRole: "primary",
    },
    rec: { lines: ["● REC"], colorRole: "negative" },
    topRight: {
      lines: [
        `RANGE   ${telemetry.range} m`,
        `CLOSURE ${telemetry.closure} m/s`,
        `BEARING ${telemetry.bearing}°`,
      ],
      colorRole: "primary",
    },
    topRightAlt: {
      lines: [`AZ ${telemetry.az}   EL ${telemetry.el}`],
      colorRole: "alt",
    },
    bottomRight: {
      lines: ["LINK  SECURE · AES-256", "AUTH  OK ▸ TRD-0042"],
      colorRole: "alt",
    },
    bottomLeft: {
      lines: [
        `ALIGN  dX ${telemetry.dX}  dY ${telemetry.dY}`,
        `       dZ ${telemetry.dZ}  ROLL ${telemetry.roll}`,
        `THRUST ${telemetry.thrust}%   MASS 42.6t`,
      ],
      colorRole: "primary",
    },
  };
}

// --- signal bars (bootCanvas.ts:969-975) ------------------------------------

export interface SignalBar {
  readonly lit: boolean;
  readonly height: number;
  /** Subtract from `width - 20` to get the bar's x position. */
  readonly xOffsetFromRight: number;
}

export function signalBars(elapsedSec: number): readonly SignalBar[] {
  "worklet";
  const bars = 5;
  const result: SignalBar[] = [];

  for (let i = 0; i < bars; i++) {
    const lit = i < 3 + Math.round(1.4 * Math.sin(elapsedSec * 4 + i) + 1.2);
    result.push({ lit, height: 4 + i * 3, xOffsetFromRight: (bars - i) * 9 });
  }

  return result;
}

// --- status ladder (bootCanvas.ts:977-1001) ---------------------------------

export interface DockingStatus {
  readonly text: string;
  readonly colorRole: DockingColorRole;
}

/** The five docking states, walked in order as `progress` advances —
 * verbatim thresholds from the web variant. */
export function dockingStatus(progress: number): DockingStatus {
  "worklet";

  if (progress >= 0.96) {
    return { text: "CLAMP ENGAGED", colorRole: "positive" };
  }

  if (progress >= 0.8) {
    return { text: "DOCKING SEQUENCE", colorRole: "alt" };
  }

  if (progress >= 0.55) {
    return { text: "TARGET LOCKED", colorRole: "alt" };
  }

  if (progress >= 0.25) {
    return { text: "TRACKING", colorRole: "primary" };
  }

  return { text: "ACQUIRING", colorRole: "primary" };
}

/** The status banner only blinks while "ACQUIRING"; every later state holds
 * steady. */
export function dockingStatusBlink(elapsedSec: number, text: string): number {
  "worklet";

  if (text !== "ACQUIRING") {
    return 1;
  }

  return 0.45 + 0.55 * Math.abs(Math.sin(elapsedSec * 7));
}

// --- final flash (bootCanvas.ts:1005-1020) ----------------------------------

/** 0 before 92% of the boot, then ramps 0→1 across the last 8%. */
export function finalFlashAlpha(progress: number): number {
  "worklet";

  if (progress <= 0.92) {
    return 0;
  }

  return (progress - 0.92) / 0.08;
}
