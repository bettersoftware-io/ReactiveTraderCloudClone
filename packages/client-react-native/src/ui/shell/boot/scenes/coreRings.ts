// packages/client-react-native/src/ui/shell/boot/scenes/coreRings.ts
import { clamp01, ease } from "#/ui/shell/boot/scenes/coreGeometry";

/**
 * The two ring layers of the `core` boot scene, deferred from phase 6a: the
 * latitude scan ring that sweeps south → north across the globe, and the two
 * counter-rotating gyroscopic segmented rings that wrap it.
 *
 * Ported verbatim from `packages/boot-splash/src/variants/bootCore.ts` —
 * scan ring lines 322-347, gyro rings 349-402.
 *
 * Every export carries the `"worklet"` directive: all of it is called from
 * inside `CoreScene`'s `createPicture` recorder worklet, and an unmarked
 * callee red-boxes on device (jest is blind to it).
 */

// --- latitude scan ring ---------------------------------------------------

const SCAN_SWEEP_RATE = 0.3;

/** The scanning parallel's latitude: a saw wave from the south pole to the
 * north pole, one full sweep every `1 / 0.3` seconds. */
export function scanRingLatitude(elapsedSec: number): number {
  "worklet";
  return -Math.PI / 2 + ((elapsedSec * SCAN_SWEEP_RATE) % 1) * Math.PI;
}

/** Depth-cued alpha for a scan-ring segment. A wider band than the mesh's
 * `segmentAlpha` (0.08..0.46 vs 0.28..0.78) because the ring must read as a
 * moving highlight over the mesh, not as more mesh. */
export function scanRingAlpha(z: number): number {
  "worklet";
  return 0.08 + 0.38 * clamp01((0.55 - z) / 1.1);
}

/** Longitude samples for the scan ring — a full turn in 40 steps, matching
 * the web loop. Constant across frames, so `CoreScene` hoists it out of the
 * per-frame path; exported for the test. */
export const SCAN_RING_SEGMENTS = 40;
export const SCAN_RING_STROKE_WIDTH = 1.4;

// --- gyroscopic segmented rings -------------------------------------------

/** One of the two rings: unit-space radius, tilt about the X axis, spin rate
 * in rad/s (signed — the two counter-rotate), colour role and stroke. */
export interface GyroRingSpec {
  readonly radius: number;
  readonly tilt: number;
  readonly spinRate: number;
  /** `true` → the theme's `accent2`, `false` → `accentPrimary`. Resolving the
   * token itself belongs to the draw site, which is where the theme lives. */
  readonly useAltColor: boolean;
  readonly alpha: number;
  readonly strokeWidth: number;
}

/** Verbatim from the web's two `drawGyroRing(...)` calls (bootCore.ts:399-400). */
export const GYRO_RINGS: readonly GyroRingSpec[] = [
  {
    radius: 1.5,
    tilt: 1.05,
    spinRate: 0.6,
    useAltColor: false,
    alpha: 0.5,
    strokeWidth: 1.2,
  },
  {
    radius: 1.66,
    tilt: -0.85,
    spinRate: -0.45,
    useAltColor: true,
    alpha: 0.3,
    strokeWidth: 1,
  },
];

export function gyroRingSpin(elapsedSec: number, spec: GyroRingSpec): number {
  "worklet";
  return elapsedSec * spec.spinRate;
}

const GYRO_SEGMENT_COUNT = 8;
const GYRO_SAMPLES_PER_SEGMENT = 10;
const GYRO_TOTAL_SAMPLES = 80;

/**
 * Angles sampled for one ring segment, or an empty list for the gap segments.
 * The web draws 8 segments of a ring that is divided into 80 sample slots,
 * skipping every 4th (`seg % 4 === 3`) so the ring reads as machinery rather
 * than a solid hoop.
 */
export function gyroSegmentAngles(segmentIndex: number): readonly number[] {
  "worklet";

  if (segmentIndex % 4 === 3) {
    return [];
  }

  const angles: number[] = [];

  for (let sample = 0; sample <= GYRO_SAMPLES_PER_SEGMENT; sample++) {
    angles.push(
      ((segmentIndex * GYRO_SAMPLES_PER_SEGMENT + sample) /
        GYRO_TOTAL_SAMPLES) *
        6.283,
    );
  }

  return angles;
}

export const GYRO_SEGMENT_INDICES: readonly number[] = Array.from(
  { length: GYRO_SEGMENT_COUNT },
  (_unused, i) => {
    return i;
  },
);

/**
 * A ring point in the globe's unit space: a circle of `spec.radius` in the
 * XZ plane, tilted about X, then spun about Z. The result is fed to
 * `projectGlobeVector` — the same camera the mesh uses, so the rings sit in
 * the same world as the globe rather than being screen-space decoration.
 */
export function gyroPointVector(
  angle: number,
  spec: GyroRingSpec,
  spin: number,
): readonly [number, number, number] {
  "worklet";
  const ringX = Math.cos(angle) * spec.radius;
  const ringZ = Math.sin(angle) * spec.radius;
  const tiltedY = -ringZ * Math.sin(spec.tilt);
  const tiltedZ = ringZ * Math.cos(spec.tilt);
  const spunX = ringX * Math.cos(spin) - tiltedY * Math.sin(spin);
  const spunY = ringX * Math.sin(spin) + tiltedY * Math.cos(spin);
  return [spunX, spunY, tiltedZ];
}

/** Ring reveal ramp: nothing before 18% of boot progress, fully in by 43%. */
export function ringsPhase(progress: number): number {
  "worklet";
  return ease((progress - 0.18) / 0.25);
}
