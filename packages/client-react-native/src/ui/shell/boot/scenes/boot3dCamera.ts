import { type Projection3dParams, project3d } from "@rtc/motion-core";

import type { GyroDrift } from "#/ui/shell/boot/useGyroDrift";

/**
 * The world→screen seam every projected boot scene shares.
 *
 * `@rtc/motion-core`'s `project3d` does the rotation and perspective divide in
 * normalised space. Each web variant then open-codes the same two extra steps —
 * multiply by a projection scale, offset to the canvas centre — inside its own
 * local `project()` closure. This module is that closure, written once.
 *
 * WORKLET SPLIT — read before adding an export. `craftGridLines` (6b-1) was
 * caught pre-merge because a build-once helper was called per frame from inside
 * a worklet; recording the split per export is what makes that visible.
 *
 *   PER-FRAME, worklet-marked:
 *     - `projectBootPoint`  — called for every vertex, every frame
 *     - `gyroYawPitch`      — called from the gyro-drift derived value
 *
 *   BUILD-ONCE, deliberately UNMARKED (call from React-land, inside a useMemo,
 *   and capture the result in the draw closure):
 *     - `bootCameraParams`  — assembles the struct; does no maths
 *
 * WHY `minPerspectiveDenom` IS OPTIONAL AND NEVER DEFAULTED. The 6b-1 scope
 * note recorded that all five projected scenes clamp at `0.4`. They do not:
 *
 *   | scene    | perspectiveK | near-plane clamp |
 *   |----------|--------------|------------------|
 *   | hologram | 0.26         | none             |
 *   | geo      | 0.22         | none             |
 *   | layers   | 0.24         | 0.4              |
 *   | jarvis   | 0.30         | 0.4              |
 *   | topo     | 0.26         | 0.4              |
 *
 * Defaulting the clamp on would silently diverge from the web at depth in two
 * of the five. `project3d` already treats an undefined `minPerspectiveDenom` as
 * "no clamp", so passing it straight through is all that is required — the
 * point is to never quietly substitute a value here.
 */

/**
 * The drift vector `useGyroDrift` actually emits.
 *
 * Imported rather than redeclared. Task 1 shipped a local `BootGyroDrift` with
 * `x`/`y` fields, which no producer in this codebase has — the real seam is
 * `mx`/`my` — so every scene would have had to adapt at the call site, and a
 * per-frame adapter object is exactly the allocation the worklet split exists
 * to avoid. A type-only import is erased, so this does not pull `expo-sensors`
 * into a module that worklets reach.
 */
export type { GyroDrift };

/** Everything `projectBootPoint` needs: camera orientation plus canvas mapping. */
export interface Boot3dCamera {
  readonly yaw: number;
  readonly pitch: number;
  readonly perspectiveK: number;
  /** Omitted ⇒ no near-plane clamp. Never defaulted — see the header. */
  readonly minPerspectiveDenom?: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly projScale: number;
}

/** Camera orientation derived from gyro drift. */
export interface BootCameraOrientation {
  readonly yaw: number;
  readonly pitch: number;
}

/** A projected point in canvas space, plus the divide that produced it. */
export interface ProjectedBootPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly perspective: number;
}

/**
 * Assemble the camera for one frame. BUILD-ONCE — call from React-land.
 *
 * Deliberately does no maths: it exists so the clamp-vs-no-clamp distinction is
 * expressed once, at the call site that knows which scene it is.
 */
export function bootCameraParams(camera: Boot3dCamera): Boot3dCamera {
  return camera;
}

/**
 * Project one world point onto the canvas. PER-FRAME — worklet.
 *
 * Delegates rotation and the perspective divide to `project3d` (itself
 * worklet-marked), then applies the scale and centre offset the web variants
 * open-code.
 */
export function projectBootPoint(
  x: number,
  y: number,
  z: number,
  camera: Boot3dCamera,
): ProjectedBootPoint {
  "worklet";

  const params: Projection3dParams = {
    yaw: camera.yaw,
    pitch: camera.pitch,
    perspectiveK: camera.perspectiveK,
    minPerspectiveDenom: camera.minPerspectiveDenom,
  };
  const projected = project3d(x, y, z, params);

  return {
    x: camera.centerX + projected.x * camera.projScale,
    y: camera.centerY + projected.y * camera.projScale,
    z: projected.z,
    perspective: projected.perspective,
  };
}

/**
 * Map gyro drift onto a bounded yaw/pitch pair. PER-FRAME — worklet.
 *
 * Each axis is clamped to `[-1, 1]` IN THE BODY, never in a default-parameter
 * position: the Worklets Babel plugin captures consts referenced in a worklet's
 * body but silently drops one referenced only as a default, which surfaced as
 * `Property 'X' doesn't exist` in #334.
 */
export function gyroYawPitch(
  drift: GyroDrift,
  yawRange: number,
  pitchRange: number,
): BootCameraOrientation {
  "worklet";

  return {
    yaw: clampUnit(drift.mx) * yawRange,
    pitch: clampUnit(drift.my) * pitchRange,
  };
}

/** Clamp to `[-1, 1]`. PER-FRAME — worklet, because `gyroYawPitch` reaches it. */
function clampUnit(value: number): number {
  "worklet";

  return Math.max(-1, Math.min(1, value));
}
