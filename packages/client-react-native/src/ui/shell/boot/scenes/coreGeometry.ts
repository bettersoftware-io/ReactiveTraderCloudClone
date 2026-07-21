// packages/client-react-native/src/ui/shell/boot/scenes/coreGeometry.ts
import { type Projection3dParams, project3d } from "@rtc/motion-core";

/**
 * Pure geometry/timing helpers for `CoreScene` — the "global market mesh"
 * globe. Kept out of the component so the real logic (lat/lon → unit vector,
 * meridian/parallel point sets, reveal timing, ping-ripple phase, status
 * text) is directly unit-testable with vitest, no Skia or Reanimated
 * involved. Every function that `CoreScene` calls from inside its
 * `useDerivedValue` picture-building worklet carries the `"worklet"`
 * directive itself (mirroring `project3d`), because Reanimated only
 * worklet-ifies a function at the point it is *defined* — a plain function
 * imported from another file and called from a worklet must already be
 * marked, or the native runtime can't run it.
 *
 * Ported verbatim (formulas unchanged) from
 * `packages/client-react/src/ui/shell/boot/variants/bootCore.ts`, restricted
 * to the five elements Task 6 ports — see `CoreScene.tsx`'s header comment
 * for the full port/defer breakdown.
 */

export function clamp01(value: number): number {
  "worklet";
  return Math.max(0, Math.min(1, value));
}

/** Cubic ease-out — verbatim from the web `ease()` (bootCanvas.ts). */
export function ease(t: number): number {
  "worklet";
  return 1 - (1 - clamp01(t)) ** 3;
}

/** Deterministic pseudo-random in [0,1) from an integer seed — verbatim
 * sine-hash from the web variant, used to seed each hub's ping-ripple phase
 * offset so it's stable across renders (not `Math.random`). Not exported: only
 * consumed internally (`CORE_HUBS`'s ping-phase seeding below), unlike the
 * other pure helpers above, which `coreGeometry.test.ts` exercises directly. */
function hashRandom(seed: number): number {
  "worklet";
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** `#rgb`/`#rrggbb` theme token → `rgba(r,g,b,alpha)` — verbatim from the
 * web `hexToRgba()`. Skia's `Skia.Color()` accepts CSS colour strings
 * directly, so this is the same "resolve alpha at draw time" idiom the web
 * canvas variants use. */
export function hexToRgba(hex: string, alpha: number): string {
  "worklet";
  let normalized = hex.replace("#", "");

  if (normalized.length === 3) {
    normalized = normalized
      .split("")
      .map((digit) => {
        return digit + digit;
      })
      .join("");
  }

  const intValue = parseInt(normalized, 16);
  return `rgba(${(intValue >> 16) & 255},${(intValue >> 8) & 255},${intValue & 255},${alpha})`;
}

/** Depth-cue alpha: the far side of the globe is dimmer than the near side. */
export function segmentAlpha(z: number): number {
  "worklet";
  return 0.1 + 0.4 * clamp01((0.55 - z) / 1.1);
}

// --- projection -------------------------------------------------------

// `GLOBE_YAW_RATE`/`GLOBE_YAW_OFFSET`/`GLOBE_TILT`/`DRIFT_YAW_INFLUENCE`/
// `DRIFT_PITCH_INFLUENCE` are consumed only by `globeYaw`/`globePitch` below,
// which `coreGeometry.test.ts` tests directly — so, unlike `GLOBE_PERSPECTIVE_K`
// (read straight by `CoreScene.tsx`), they stay file-private.
const GLOBE_YAW_RATE = 0.42;
const GLOBE_YAW_OFFSET = 0.6;
const GLOBE_TILT = 0.38;
export const GLOBE_PERSPECTIVE_K = 0.28;

/** Cap on how far the gyro-drift pointer seam may steer yaw/pitch — an RN
 * addition (the web globe is fixed-tilt, no cursor). Kept small so it reads
 * as parallax, not steering. */
const DRIFT_YAW_INFLUENCE = 0.12;
const DRIFT_PITCH_INFLUENCE = 0.12;

export function globeYaw(elapsedSec: number, driftMx: number): number {
  "worklet";
  return (
    elapsedSec * GLOBE_YAW_RATE +
    GLOBE_YAW_OFFSET +
    driftMx * DRIFT_YAW_INFLUENCE
  );
}

export function globePitch(driftMy: number): number {
  "worklet";
  return GLOBE_TILT + driftMy * DRIFT_PITCH_INFLUENCE;
}

/** Unit-sphere cartesian vector for a lat/lon pair (Y-up). */
export function hubVectorFromLatLon(
  lat: number,
  lon: number,
): readonly [number, number, number] {
  "worklet";
  return [
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.sin(lon),
  ];
}

export interface GlobeScreenPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly perspective: number;
}

/** `project3d` returns unit-space coordinates; this applies the globe's
 * centre, radius and Y-up sign (`centerY - y * radius`) on top, so callers
 * work in screen pixels. */
export function projectGlobePoint(
  lat: number,
  lon: number,
  params: Projection3dParams,
  centerX: number,
  centerY: number,
  radius: number,
): GlobeScreenPoint {
  "worklet";
  const [x, y, z] = hubVectorFromLatLon(lat, lon);
  const projected = project3d(x, y, z, params);
  return {
    x: centerX + projected.x * radius,
    y: centerY - projected.y * radius,
    z: projected.z,
    perspective: projected.perspective,
  };
}

/** Seconds-since-mount → 0..1 boot fraction, mirroring the web's
 * `progress = min(1, (performance.now() - start) / BOOT_DURATION_MS)`. RN
 * has no shared `start` timestamp to read from inside a worklet, but
 * `BootCanvas`'s `elapsedSec` already zeroes at scene mount, so it stands in
 * directly. */
export function bootProgress(elapsedSec: number, durationMs: number): number {
  "worklet";
  return clamp01((elapsedSec * 1000) / durationMs);
}

// --- meridians ----------------------------------------------------------

export const MERIDIAN_COUNT = 12;
const MERIDIAN_LAT_SEGMENTS = 28;

export function meridianLongitude(
  meridianIndex: number,
  meridianCount: number,
): number {
  "worklet";
  return (meridianIndex / meridianCount) * Math.PI * 2;
}

/** Staggered per-meridian cascade: meridian `meridianIndex` starts growing
 * once `reveal` passes its slot, so they sweep in one after another. */
export function meridianRevealPhase(
  reveal: number,
  meridianCount: number,
  meridianIndex: number,
): number {
  "worklet";
  return clamp01(reveal * meridianCount - meridianIndex);
}

/** Pole-to-pole latitude samples for a meridian at reveal `phase` — grows
 * from the south pole up to `-π/2 + π·phase`, stopping (not including) the
 * first sample past that cutoff, matching the web loop's `break`. */
export function meridianLatitudes(
  phase: number,
  segments: number = MERIDIAN_LAT_SEGMENTS,
): readonly number[] {
  "worklet";
  const maxLat = -Math.PI / 2 + Math.PI * phase;
  const lats: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const lat = -Math.PI / 2 + (Math.PI * i) / segments;

    if (lat > maxLat) {
      break;
    }

    lats.push(lat);
  }

  return lats;
}

// --- parallels ------------------------------------------------------------

export const PARALLEL_INDICES: readonly number[] = [-2, -1, 0, 1, 2];
const PARALLEL_LON_SEGMENTS = 40;

export function parallelLatitude(parallelIndex: number): number {
  "worklet";
  return (parallelIndex * Math.PI) / 6;
}

export function parallelRevealPhase(
  reveal: number,
  parallelIndex: number,
): number {
  "worklet";
  return clamp01(reveal * 5 - (parallelIndex + 2));
}

/** Longitude samples for one parallel ring, growing around the ring as
 * `phase` advances (matches the web's `Math.floor(40 * parallelPhase)`
 * partial-loop cutoff). */
export function parallelLongitudes(
  phase: number,
  segments: number = PARALLEL_LON_SEGMENTS,
): readonly number[] {
  "worklet";
  const count = Math.floor(segments * phase);
  const lons: number[] = [];

  for (let i = 0; i <= count; i++) {
    lons.push((i / segments) * Math.PI * 2);
  }

  return lons;
}

// --- hub nodes + ping ripples ----------------------------------------------

export interface CoreHub {
  readonly lat: number;
  readonly lon: number;
  readonly code: string;
  /** Ping-ripple phase offset, seeded deterministically per hub. */
  readonly phase: number;
}

const RAW_HUBS: ReadonlyArray<readonly [number, number, string]> = [
  [51.5, -0.1, "LON"],
  [40.7, -74, "NYC"],
  [35.7, 139.7, "TYO"],
  [1.3, 103.8, "SGP"],
  [-33.9, 151.2, "SYD"],
  [50.1, 8.7, "FRA"],
  [22.3, 114.2, "HKG"],
  [47.4, 8.5, "ZRH"],
  [-23.5, -46.6, "SAO"],
  [25.2, 55.3, "DXB"],
];

/** Ten global trading hubs — verbatim from the web `HUBS` table. */
export const CORE_HUBS: readonly CoreHub[] = RAW_HUBS.map(
  ([latDeg, lonDeg, code], i) => {
    return {
      lat: (latDeg * Math.PI) / 180,
      lon: (lonDeg * Math.PI) / 180,
      code,
      phase: hashRandom(i * 19 + 5) * 6.283,
    };
  },
);

/** Staggered per-hub cascade, same shape as `meridianRevealPhase`. */
export function nodeRevealPhase(
  nodesPhase: number,
  index: number,
  hubCount: number,
): number {
  "worklet";
  return clamp01(nodesPhase * hubCount - index * 0.5);
}

export function nodeAlpha(nodePhase: number, z: number): number {
  "worklet";
  return (0.4 + 0.55 * clamp01(0.3 - z)) * nodePhase;
}

/** 0..1 ping-ripple fraction (loops every ~1.25s, offset per hub). */
export function pingRingFraction(elapsedSec: number, hubPhase: number): number {
  "worklet";
  return (elapsedSec * 0.8 + hubPhase) % 1;
}

export function pingRingRadius(
  perspective: number,
  ringFraction: number,
): number {
  "worklet";
  return (2 + ringFraction * 10) * perspective;
}

export function pingRingAlpha(ringFraction: number, nodePhase: number): number {
  "worklet";
  return (1 - ringFraction) * 0.5 * nodePhase;
}

// --- status banner --------------------------------------------------------

export interface CoreBootStatus {
  readonly text: string;
  /** `true` once the mesh reports online — swap accent → accent2. */
  readonly useAltColor: boolean;
}

/** SPINNING UP CORE → LINKING GLOBAL NODES → MESH ONLINE, keyed off boot
 * progress alone — verbatim thresholds from the web variant. */
export function coreBootStatus(progress: number): CoreBootStatus {
  "worklet";

  if (progress >= 0.7) {
    return { text: "MESH ONLINE ▸ HANDOFF", useAltColor: true };
  }

  if (progress >= 0.32) {
    return { text: "LINKING GLOBAL NODES", useAltColor: false };
  }

  return { text: "SPINNING UP CORE", useAltColor: false };
}

/** Banner blinks while "spinning up", then holds steady. */
export function bannerBlinkAlpha(progress: number, elapsedSec: number): number {
  "worklet";

  if (progress >= 0.32) {
    return 1;
  }

  return 0.55 + 0.45 * Math.abs(Math.sin(elapsedSec * 5));
}
