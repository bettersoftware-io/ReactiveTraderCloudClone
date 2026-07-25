// packages/client-react-native/src/ui/shell/boot/scenes/coreArcs.ts
import { BOOT_DURATION_MS } from "@rtc/client-core";

import {
  CORE_HUBS,
  clamp01,
  hashRandom,
} from "#/ui/shell/boot/scenes/coreGeometry";

/**
 * Order-flow arcs and the rotating spotlight callout — two `core` scene
 * layers deferred from phase 6a.
 *
 * Ported from `packages/boot-splash/src/variants/bootCore.ts` (spotlight
 * 435-471, arcs 473-558), with ONE deliberate structural change: the web
 * keeps mutable per-boot state (an `arcs` array it pushes/splices, a
 * `lastArcSec`, an incrementing seed counter, a cumulative count). A worklet
 * recorder has to be a pure function of `elapsedSec` — otherwise the picture
 * stops being reproducible and the pinned visual golden stops being
 * deterministic — so the same behaviour is expressed as a closed-form
 * schedule: arc `n` starts at `ARC_FIRST_SEC + n * ARC_INTERVAL_SEC` and
 * draws its four random properties from the same `hashRandom` seeds
 * (7 + 4n .. 10 + 4n) the web's counter would have produced.
 *
 * The web's `arcs.length < 6` concurrency cap is NOT ported: durations top
 * out at 2.3s against a 0.5s spawn interval, so at most 5 arcs are ever live
 * and the cap can never bind. `coreArcs.test.ts` asserts that bound directly,
 * so if the constants ever change the test fails rather than the visual
 * silently drifting.
 *
 * All exports carry `"worklet"` — every one is called from inside
 * `CoreScene`'s recorder worklet.
 */

/** Boot progress at which the web opens the arc gate (`progress > 0.36`),
 * converted to seconds against the shared boot duration. */
export const ARC_FIRST_SEC: number = 0.36 * (BOOT_DURATION_MS / 1000);
export const ARC_INTERVAL_SEC = 0.5;

const ARC_SEED_BASE = 7;
const ARC_SEED_STRIDE = 4;
const ARC_MIN_DURATION_SEC = 1.5;
const ARC_DURATION_SPREAD_SEC = 0.8;
const ARC_BUY_THRESHOLD = 0.45;
/** Great-circle lift: the arc bows off the sphere by up to 28% at its
 * midpoint, tapering to nothing at both hubs. */
const ARC_BULGE = 0.28;

/** A currently-in-flight arc, resolved for one instant. */
export interface ActiveFlowArc {
  readonly fromHub: number;
  readonly toHub: number;
  /** 0..1 along the arc — the draw head's position. */
  readonly progress: number;
  readonly buy: boolean;
}

/** How many arcs have been scheduled by `elapsedSec` — the web's cumulative
 * `arcCount`, which the corner telemetry readout prints as `LINKS n`. */
export function spawnedArcCount(elapsedSec: number): number {
  "worklet";

  if (elapsedSec < ARC_FIRST_SEC) {
    return 0;
  }

  return Math.floor((elapsedSec - ARC_FIRST_SEC) / ARC_INTERVAL_SEC) + 1;
}

function arcDurationSec(index: number): number {
  "worklet";
  return (
    ARC_MIN_DURATION_SEC +
    hashRandom(ARC_SEED_BASE + 2 + ARC_SEED_STRIDE * index) *
      ARC_DURATION_SPREAD_SEC
  );
}

/** The arcs in flight at `elapsedSec`, oldest first. */
export function activeFlowArcs(elapsedSec: number): readonly ActiveFlowArc[] {
  "worklet";
  const spawned = spawnedArcCount(elapsedSec);
  const arcs: ActiveFlowArc[] = [];
  const hubCount = CORE_HUBS.length;

  for (let index = 0; index < spawned; index++) {
    const startSec = ARC_FIRST_SEC + index * ARC_INTERVAL_SEC;
    const progress = (elapsedSec - startSec) / arcDurationSec(index);

    if (progress < 0 || progress >= 1) {
      continue;
    }

    const fromHub = Math.floor(
      hashRandom(ARC_SEED_BASE + ARC_SEED_STRIDE * index) * hubCount,
    );

    let toHub = Math.floor(
      hashRandom(ARC_SEED_BASE + 1 + ARC_SEED_STRIDE * index) * hubCount,
    );

    if (toHub === fromHub) {
      toHub = (toHub + 4) % hubCount;
    }

    arcs.push({
      fromHub,
      toHub,
      progress,
      buy:
        hashRandom(ARC_SEED_BASE + 3 + ARC_SEED_STRIDE * index) >
        ARC_BUY_THRESHOLD,
    });
  }

  return arcs;
}

/**
 * A point `fraction` of the way along the great-circle path between two hub
 * vectors, re-normalized onto the sphere and lifted by a sine bulge so the
 * arc bows toward the camera instead of hugging the surface.
 */
export function arcBulgeVector(
  fraction: number,
  fromVec: readonly [number, number, number],
  toVec: readonly [number, number, number],
): readonly [number, number, number] {
  "worklet";
  const x = fromVec[0] + (toVec[0] - fromVec[0]) * fraction;
  const y = fromVec[1] + (toVec[1] - fromVec[1]) * fraction;
  const z = fromVec[2] + (toVec[2] - fromVec[2]) * fraction;
  const length = Math.hypot(x, y, z) || 1;
  const bulge = 1 + ARC_BULGE * Math.sin(Math.PI * fraction);
  return [(x / length) * bulge, (y / length) * bulge, (z / length) * bulge];
}

/** Samples along the faint full-length arc and along the bright tail. */
export const ARC_TRAIL_SAMPLES = 20;
export const ARC_TAIL_SAMPLES = 8;
/** The bright tail trails the head by this much of the arc. */
export const ARC_TAIL_LENGTH = 0.18;
/** Landing-ripple window: the last 12% of an arc's flight. */
export const ARC_RIPPLE_START = 0.88;

export function arcRippleFraction(progress: number): number {
  "worklet";
  return clamp01((progress - ARC_RIPPLE_START) / (1 - ARC_RIPPLE_START));
}

// --- rotating spotlight callout -------------------------------------------

const SPOTLIGHT_DWELL_SEC = 2.2;

/** Which hub the callout is labelling right now — one every 2.2 seconds,
 * wrapping around the hub table. */
export function spotlightIndex(elapsedSec: number, hubCount: number): number {
  "worklet";
  return Math.floor(elapsedSec / SPOTLIGHT_DWELL_SEC) % hubCount;
}

/** The decorative "FLOW nnnM/S" figure under the hub code. Verbatim from the
 * web: a 120..300 band driven by a slow sine offset per hub. */
export function spotlightFlowRate(
  elapsedSec: number,
  hubPhase: number,
): number {
  "worklet";
  return 120 + Math.round(90 * Math.sin(elapsedSec * 0.7 + hubPhase) + 90);
}

/** Leader-line and label offsets, in screen pixels, verbatim from the web. */
export const SPOTLIGHT_ELBOW_DX = 12;
export const SPOTLIGHT_ELBOW_DY = -14;
export const SPOTLIGHT_LABEL_WIDTH = 110;
export const SPOTLIGHT_LABEL_MIN_X = 16;
export const SPOTLIGHT_LABEL_RIGHT_INSET = 130;
