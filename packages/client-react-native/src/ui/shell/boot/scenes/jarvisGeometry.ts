// packages/client-react-native/src/ui/shell/boot/scenes/jarvisGeometry.ts
import { BOOT_TELEMETRY_BULLET } from "./bootGlyphs";
import { clamp01, ease, hashRandom } from "./coreGeometry";

/**
 * Pure geometry/timing/copy for `JarvisScene` — "HOLO CORE · RT / 3Dx.40A",
 * the densest boot scene: a wireframe core sphere inside six layers of ring
 * machinery, eight radial spoke walkways, a radar wedge, and fourteen
 * depth-scattered blueprint fragments that glitch in, breathe along Z, get
 * tethered to the outer ring and cross-linked, with one lunging at the camera
 * every ~1.6 s.
 *
 * Ported verbatim (formulas and strings unchanged) from
 * `packages/boot-splash/src/variants/bootJarvis.ts`.
 *
 * WORKLET SPLIT — read before adding an export.
 *
 *   BUILD-ONCE, deliberately UNMARKED:
 *     - `jarvisFragments`, `jarvisParticles`, `JARVIS_RINGS`, every constant
 *
 *   PER-FRAME, worklet-marked:
 *     - everything else
 *
 * PROJECTION. `JARVIS_PERSPECTIVE_K` is 0.30 **with** a near-plane clamp at
 * `JARVIS_MIN_PERSPECTIVE_DENOM` — `bootJarvis.ts:166`.
 *
 * NO MUTABLE STATE CROSSES A FRAME. The web carries two pieces of per-frame
 * mutable closure state, and a worklet captures values rather than sharing a
 * live closure, so both are ported as pure functions of time:
 *
 *   - `ringZPlane` — assigned before each ring draws, read by `projectPolar`
 *     when no explicit z is passed. It looks like accumulated state but is not:
 *     the web computes it as `sin(elapsed * 0.5 + ringIdx * 1.25) * 0.09`, so
 *     `ringZPlane(elapsedSec, ringIndex)` here is EXACT. The silent failure is
 *     pinning it to 0 — the rings would sit flat instead of breathing, which
 *     looks almost right.
 *   - `fragment.currentZ` — written during the fragment pass and read later by
 *     the cross-link pass. `fragmentZ()` recomputes it, reproducing BOTH
 *     branches including the un-revealed one that resets to `baseZ`; get that
 *     wrong and the cross-links attach to the wrong depths.
 *
 * The `z === undefined ? ringZPlane : z` resolution in the web is IN THE BODY,
 * which is the safe form under the #334 worklet rule. `projectJarvisPolar`
 * keeps that shape by taking the plane explicitly rather than defaulting it.
 */

/** Perspective divisor coefficient, and the near-plane clamp the web applies. */
export const JARVIS_PERSPECTIVE_K = 0.3;
export const JARVIS_MIN_PERSPECTIVE_DENOM = 0.4;

/** Projection scale as a fraction of `min(width, height)`. */
export const JARVIS_PROJ_SCALE_FACTOR = 0.42;

/** The ring machinery starts at the top of the dial. */
export const JARVIS_TOP_ANGLE = -Math.PI / 2;

/** One of the fourteen blueprint fragments. */
export interface JarvisFragment {
  readonly baseX: number;
  readonly baseY: number;
  readonly baseZ: number;
  readonly zSpeed: number;
  readonly zAmplitude: number;
  readonly scale: number;
  readonly kind: number;
  readonly phase: number;
  readonly revealAt: number;
  readonly angle: number;
  readonly id: string;
}

/** One drifting background dust particle. */
export interface JarvisParticle {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly driftSpeed: number;
  readonly seed: number;
}

/** What a ring layer draws. */
type JarvisRingKind = "ticks" | "segs" | "dash" | "pads" | "arcs" | "ruler";

/** One of the six ring-machinery layers. */
export interface JarvisRing {
  readonly radius: number;
  readonly revealAt: number;
  readonly kind: JarvisRingKind;
}

/** The six ring layers, innermost first — the order they sweep in. */
export const JARVIS_RINGS: readonly JarvisRing[] = [
  { radius: 0.3, revealAt: 0.05, kind: "ticks" },
  { radius: 0.38, revealAt: 0.1, kind: "segs" },
  { radius: 0.5, revealAt: 0.15, kind: "dash" },
  { radius: 0.62, revealAt: 0.2, kind: "pads" },
  { radius: 0.78, revealAt: 0.25, kind: "arcs" },
  { radius: 0.95, revealAt: 0.3, kind: "ruler" },
];

/** The labels riding the dashed ring. */
export const JARVIS_RING_LABELS: readonly string[] = [
  "CL/7 PRICING",
  "RISK CORE",
  "ORDER MESH",
];

/** The fourteen blueprint fragments. BUILD-ONCE. */
export function jarvisFragments(): readonly JarvisFragment[] {
  const fragments: JarvisFragment[] = [];

  for (let i = 0; i < 14; i++) {
    const angle = hashRandom(i * 3 + 1) * 6.283;
    const radius = 0.58 + hashRandom(i * 5 + 2) * 0.6;

    fragments.push({
      baseX: Math.cos(angle) * radius * 1.4,
      baseY: Math.sin(angle) * radius * 0.85,
      baseZ: (hashRandom(i * 7 + 3) - 0.5) * 1.0,
      zSpeed: 0.35 + hashRandom(i * 19 + 8) * 0.7,
      zAmplitude: 0.22 + hashRandom(i * 23 + 9) * 0.28,
      scale: 0.06 + hashRandom(i * 11 + 4) * 0.05,
      kind: i % 5,
      phase: hashRandom(i * 13 + 5) * 6.283,
      revealAt: 0.34 + (i / 14) * 0.42,
      angle,
      id: `ND-${30 + Math.floor(hashRandom(i * 17 + 6) * 60)}`,
    });
  }

  return fragments;
}

/** The 55 drifting dust particles. BUILD-ONCE. */
export function jarvisParticles(): readonly JarvisParticle[] {
  const particles: JarvisParticle[] = [];

  for (let i = 0; i < 55; i++) {
    particles.push({
      x: (hashRandom(i * 17 + 2) - 0.5) * 3.0,
      y: (hashRandom(i * 19 + 3) - 0.5) * 2.0,
      z: (hashRandom(i * 23 + 4) - 0.5) * 1.2,
      driftSpeed: 0.04 + hashRandom(i * 29 + 5) * 0.1,
      seed: hashRandom(i * 31 + 6),
    });
  }

  return particles;
}

/** Camera yaw — a slow sway plus the pointer/gyro seam. */
export function jarvisYaw(elapsedSec: number, driftX: number): number {
  "worklet";

  return 0.55 + 0.18 * Math.sin(elapsedSec * 0.35) + driftX * 0.3;
}

/** Camera pitch — a slow sway plus the pointer/gyro seam. */
export function jarvisPitch(elapsedSec: number, driftY: number): number {
  "worklet";

  return 0.3 + 0.08 * Math.sin(elapsedSec * 0.27) + driftY * 0.18;
}

/** The whole-frame flicker — a fast shimmer plus a rare dropout to 55%. */
export function jarvisFlicker(elapsedSec: number): number {
  "worklet";

  const shimmer =
    0.88 + 0.12 * Math.sin(elapsedSec * 36 + Math.sin(elapsedSec * 9) * 4);

  if (hashRandom(Math.floor(elapsedSec * 6) + 9) > 0.94) {
    return shimmer * 0.55;
  }

  return shimmer;
}

/**
 * The Z-plane a given ring breathes on.
 *
 * The web assigns this to a shared mutable `ringZPlane` before each ring draws;
 * it is a pure function of time and ring index, so this is exact. Pinning it to
 * 0 leaves the rings flat instead of breathing.
 */
export function ringZPlane(elapsedSec: number, ringIndex: number): number {
  "worklet";

  return Math.sin(elapsedSec * 0.5 + ringIndex * 1.25) * 0.09;
}

/** The spoke walkways breathe on their own plane, not a ring's. */
export function spokeZPlane(elapsedSec: number): number {
  "worklet";

  return Math.sin(elapsedSec * 0.45 + 2.0) * 0.06;
}

/** How far one ring has swept in, 0→1. */
export function ringPhase(ring: JarvisRing, progress: number): number {
  "worklet";

  return ease((progress - ring.revealAt) / 0.18);
}

/** How far the core sphere has grown, 0→1. */
export function spherePhase(progress: number): number {
  "worklet";

  return ease(progress / 0.16);
}

/** The core sphere's radius at `progress`. */
export function sphereRadius(progress: number): number {
  "worklet";

  return 0.2 * spherePhase(progress);
}

/** The core sphere's spin angle. */
export function sphereSpin(elapsedSec: number): number {
  "worklet";

  return elapsedSec * 0.55;
}

/** The core sphere bobs along Z. */
export function sphereBob(elapsedSec: number): number {
  "worklet";

  return Math.sin(elapsedSec * 0.6) * 0.1;
}

/** How far the spoke walkways have extended, 0→1. */
export function spokesPhase(progress: number): number {
  "worklet";

  return ease((progress - 0.22) / 0.2);
}

/** The radar wedge's leading edge angle. */
export function wedgeStartAngle(elapsedSec: number): number {
  "worklet";

  return elapsedSec * 0.5;
}

/** Which fragment is lunging at the camera right now. */
export function lungeFragmentIndex(elapsedSec: number): number {
  "worklet";

  return Math.floor(elapsedSec / 1.6) % 14;
}

/** How far the lunging fragment has travelled, 0→1→0. */
export function lungeAmount(elapsedSec: number): number {
  "worklet";

  return Math.sin(Math.PI * ((elapsedSec % 1.6) / 1.6));
}

/** How far one fragment has glitched in, 0→1. */
export function fragmentRevealPhase(
  fragment: JarvisFragment,
  progress: number,
): number {
  "worklet";

  return ease((progress - fragment.revealAt) / 0.12);
}

/** Whether a fragment is the one currently lunging. */
export function fragmentIsLunging(
  fragmentIndex: number,
  elapsedSec: number,
  progress: number,
): boolean {
  "worklet";

  return fragmentIndex === lungeFragmentIndex(elapsedSec) && progress > 0.45;
}

/**
 * A fragment's Z at this instant.
 *
 * Reproduces BOTH of the web's branches: an un-revealed fragment sits at its
 * `baseZ`, a revealed one breathes and may be lunging. The cross-link pass
 * reads this for every fragment regardless of reveal state, so collapsing the
 * un-revealed branch would attach links at the wrong depths.
 */
export function fragmentZ(
  fragment: JarvisFragment,
  fragmentIndex: number,
  elapsedSec: number,
  progress: number,
): number {
  "worklet";

  if (fragmentRevealPhase(fragment, progress) <= 0) {
    return fragment.baseZ;
  }

  const breathe =
    Math.sin(elapsedSec * fragment.zSpeed + fragment.phase) *
    fragment.zAmplitude;

  const lunge = fragmentIsLunging(fragmentIndex, elapsedSec, progress)
    ? 0.6 * lungeAmount(elapsedSec)
    : 0;

  return fragment.baseZ + breathe - lunge;
}

/** A fragment's horizontal jitter while it is still glitching in. */
export function fragmentGlitch(
  fragmentIndex: number,
  revealPhase: number,
  elapsedSec: number,
): number {
  "worklet";

  if (revealPhase >= 1) {
    return 0;
  }

  return (
    (hashRandom(Math.floor(elapsedSec * 30) + fragmentIndex) * 6 - 3) *
    (1 - revealPhase)
  );
}

/** A fragment's opacity — nearer reads stronger, and a lunge lifts it. */
export function fragmentAlpha(
  z: number,
  revealPhase: number,
  isLunging: boolean,
  elapsedSec: number,
): number {
  "worklet";

  const nearness = clamp01((0.5 - z) / 1.2);
  const lungeLift = isLunging ? 1 + 0.35 * lungeAmount(elapsedSec) : 1;

  return Math.min(1, (0.3 + 0.45 * nearness) * revealPhase * lungeLift);
}

/** How many fragments are visible at `progress` — drives the telemetry count. */
export function shownFragmentCount(
  fragments: readonly JarvisFragment[],
  progress: number,
): number {
  "worklet";

  let shown = 0;

  for (const fragment of fragments) {
    if (fragmentRevealPhase(fragment, progress) > 0) {
      shown++;
    }
  }

  return shown;
}

/** A fragment's depth label, e.g. `ND-42 · Z-13`. */
export function fragmentLabel(fragment: JarvisFragment, z: number): string {
  "worklet";

  return `${fragment.id} · Z${(z * 100).toFixed(0)}`;
}

/** How far the cross-links between fragments have faded in, 0→1. */
export function crossLinkPhase(progress: number): number {
  "worklet";

  return ease((progress - 0.6) / 0.15);
}

/** A particle's drifted Y at `elapsedSec`. */
export function particleDriftY(
  particle: JarvisParticle,
  elapsedSec: number,
): number {
  "worklet";

  return (
    particle.y -
    ((elapsedSec * particle.driftSpeed + particle.seed) % 1) * 0.5 +
    0.25
  );
}

/** A particle's twinkling alpha. */
export function particleAlpha(
  particle: JarvisParticle,
  elapsedSec: number,
): number {
  "worklet";

  return (
    0.22 *
    (0.4 + 0.6 * hashRandom(Math.floor(elapsedSec * 2) + particle.seed * 99))
  );
}

/** The four corner telemetry readouts. */
export interface JarvisTelemetry {
  readonly title: string;
  readonly elements: string;
  readonly orientation: string;
  readonly track: string;
}

/**
 * Corner telemetry.
 *
 * The title opens with `BOOT_TELEMETRY_BULLET`, not the web's `◉`
 * FISHEYE, which no bundled face covers.
 *
 * `track` keeps the web's "CURSOR TRACK · LIVE" verbatim even though this
 * platform tracks a gyroscope — same call as `layers`. Changing approved copy
 * is a design decision, not a porting one.
 */
export function jarvisTelemetry(
  shownCount: number,
  yaw: number,
  pitch: number,
): JarvisTelemetry {
  "worklet";

  return {
    title: `${BOOT_TELEMETRY_BULLET} HOLO CORE · RT / 3Dx.40A`,
    elements: `ELEMENTS ${15 + shownCount} / 29 · DEPTH FIELD ON`,
    orientation: `YAW ${(yaw * 57.29).toFixed(1)}°  PITCH ${(pitch * 57.29).toFixed(1)}°`,
    track: "CURSOR TRACK · LIVE",
  };
}

/** The status banner's text and whether it takes the alt accent. */
export interface JarvisStatus {
  readonly text: string;
  readonly useAltAccent: boolean;
}

/** The three-state status ladder. */
export function jarvisStatus(progress: number): JarvisStatus {
  "worklet";

  if (progress >= 0.75) {
    return { text: "HOLOGRAM STABLE ▸ HANDOFF", useAltAccent: true };
  }

  if (progress >= 0.32) {
    return { text: "LINKING SUBSYSTEMS", useAltAccent: false };
  }

  return { text: "PROJECTING SCHEMATIC", useAltAccent: false };
}

/** The banner blinks until the subsystems link, then holds solid. */
export function jarvisBlinkAlpha(progress: number, elapsedSec: number): number {
  "worklet";

  if (progress >= 0.32) {
    return 1;
  }

  return 0.55 + 0.45 * Math.abs(Math.sin(elapsedSec * 5));
}
