// packages/client-react-native/src/ui/shell/boot/scenes/layersGeometry.ts
import { BOOT_DURATION_MS } from "@rtc/client-core";

import { BOOT_TELEMETRY_BULLET } from "./bootGlyphs";
import { clamp01, ease, hashRandom } from "./coreGeometry";

/**
 * Pure geometry/timing/copy for `LayersScene` — "UI COMPOSITOR · LAYER VIEW",
 * the app's own layout decomposed into seven z-separated wireframe layers that
 * explode apart, get inspected one at a time, then recomposite flat.
 *
 * Ported verbatim (formulas and strings unchanged) from
 * `packages/boot-splash/src/variants/bootLayers.ts`.
 *
 * WORKLET SPLIT — read before adding an export.
 *
 *   BUILD-ONCE, deliberately UNMARKED:
 *     - `LAYER_PANELS`, `PULLABLE_PANELS`, every exported constant
 *
 *   PER-FRAME, worklet-marked:
 *     - everything else
 *
 * PROJECTION. `LAYERS_PERSPECTIVE_K` is 0.24 **with** a near-plane clamp at
 * `LAYERS_MIN_PERSPECTIVE_DENOM` — the web is
 * `1 / Math.max(0.4, 1 + z2 * 0.24)`. This is the opposite of `hologram`,
 * which uses 0.26 and no clamp at all; the pair is exactly why
 * `boot3dCamera` parameterises both rather than defaulting one.
 *
 * THERE IS NO PHASE ENUM. The 6b-2a plan sketched a `layersPhase(progress)`
 * returning named states ("draw-in" / "explode" / "orbit" / "recomposite").
 * The source has nothing of the kind: the schedule is one CONTINUOUS envelope,
 *
 *   spread = ease((p - 0.14) / 0.2) * (1 - ease((p - 0.93) / 0.07))
 *
 * which rises, holds, and falls back to flat. Every spatial term keys off that
 * single number — yaw, pitch, z-separation, ghost frames and the layer tags
 * all scale by it, which is why the stack lies perfectly flat at both ends of
 * the boot. Modelling it as four discrete states would have quantised a smooth
 * animation. The named states that DO exist are the status ladder, and they
 * are only copy — see `layersStatus`.
 */

/** What a panel draws inside itself. */
type LayerPanelKind =
  | "bg"
  | "status"
  | "blotter"
  | "main"
  | "list"
  | "header";

/** One exploded UI layer — normalised rect, z-depth, content kind. */
export interface LayerPanel {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly z: number;
  readonly kind: LayerPanelKind;
  readonly label: string;
  /** Whether the inspection cycle ever pulls this layer toward the camera. */
  readonly pull: boolean;
}

/**
 * The app's own layout, decomposed into seven z-separated layers.
 *
 * Order is load-bearing twice over: `panelDrawPhase` staggers the draw-in by
 * array index, and the pulled-layer cycle walks `PULLABLE_PANELS` in this
 * order. Reordering changes the animation, not just the code.
 */
export const LAYER_PANELS: readonly LayerPanel[] = [
  {
    x: 0.02,
    y: 0.0,
    w: 0.96,
    h: 0.96,
    z: 0.55,
    kind: "bg",
    label: "L06 · BACKDROP GRID",
    pull: false,
  },
  {
    x: 0.05,
    y: 0.88,
    w: 0.9,
    h: 0.05,
    z: 0.38,
    kind: "status",
    label: "L05 · SYSTEM BUS",
    pull: true,
  },
  {
    x: 0.05,
    y: 0.69,
    w: 0.9,
    h: 0.16,
    z: 0.24,
    kind: "blotter",
    label: "L04 · TRADE BLOTTER",
    pull: true,
  },
  {
    x: 0.05,
    y: 0.18,
    w: 0.56,
    h: 0.47,
    z: 0.0,
    kind: "main",
    label: "L03 · FX PRICING GRID",
    pull: true,
  },
  {
    x: 0.64,
    y: 0.18,
    w: 0.31,
    h: 0.21,
    z: -0.22,
    kind: "list",
    label: "L02 · WATCHLIST",
    pull: true,
  },
  {
    x: 0.64,
    y: 0.44,
    w: 0.31,
    h: 0.21,
    z: -0.3,
    kind: "list",
    label: "L02 · RFQ INBOX",
    pull: true,
  },
  {
    x: 0.05,
    y: 0.06,
    w: 0.9,
    h: 0.08,
    z: -0.45,
    kind: "header",
    label: "L01 · COMMAND BAR",
    pull: true,
  },
];

/** The six layers the inspection cycle walks, in cycle order. */
export const PULLABLE_PANELS: readonly LayerPanel[] = LAYER_PANELS.filter(
  (panel) => {
    return panel.pull;
  },
);

/** Perspective divisor coefficient, and the near-plane clamp the web applies. */
export const LAYERS_PERSPECTIVE_K = 0.24;
export const LAYERS_MIN_PERSPECTIVE_DENOM = 0.4;

/** Projection scale as a fraction of `min(width, height)`. */
export const LAYERS_PROJ_SCALE_FACTOR = 0.42;

/** Normalised panel rect → world units. */
const LAYERS_WORLD_WIDTH = 2.6;
const LAYERS_WORLD_HEIGHT = 1.7;

/** How far the z-explode separates the stack, and how far a pull travels. */
const LAYERS_Z_SPREAD_FACTOR = 1.15;
export const LAYERS_PULL_DEPTH = -0.85;

/** One inspection step, seconds. Six pullable layers ⇒ a 6.3 s cycle. */
export const PULL_STEP_SEC = 1.05;

/** The inspection cycle runs between these two points of the boot. */
const PULL_START_PROGRESS = 0.38;
const PULL_END_PROGRESS = 0.92;

/** A pull below this amount does not count as "pulled" (no glow, no callout). */
export const PULL_ACTIVE_THRESHOLD = 0.05;

/** Ghost frames appear once the stack has separated this far. */
export const GHOST_FRAME_MIN_SPREAD = 0.05;

/** Layer id tags appear once the stack has separated this far. */
export const LAYER_TAG_MIN_SPREAD = 0.3;

/**
 * The z-separation envelope, 0 → 1 → 0.
 *
 * The spine of the whole scene: yaw, pitch, panel z, ghost frames and layer
 * tags all scale by it, so the stack is perfectly flat at both ends.
 */
export function layersSpread(progress: number): number {
  "worklet";

  return ease((progress - 0.14) / 0.2) * (1 - ease((progress - 0.93) / 0.07));
}

/** Camera yaw — a slow sway plus the pointer/gyro seam, scaled by spread. */
export function layersYaw(
  elapsedSec: number,
  driftX: number,
  spread: number,
): number {
  "worklet";

  return (0.5 + Math.sin(elapsedSec * 0.5) * 0.2 + driftX * 0.45) * spread;
}

/** Camera pitch — a fixed tilt plus the pointer/gyro seam, scaled by spread. */
export function layersPitch(driftY: number, spread: number): number {
  "worklet";

  return (0.15 + driftY * 0.22) * spread;
}

/** Whether the inspection cycle is running at this point of the boot. */
export function pullActive(progress: number): boolean {
  "worklet";

  return progress > PULL_START_PROGRESS && progress < PULL_END_PROGRESS;
}

/**
 * Seconds into the inspection cycle.
 *
 * Keyed off ELAPSED SECONDS, not progress — the plan's draft sketched
 * `pulledPanelIndex(progress)`, but the web advances the cycle on a wall-clock
 * 1.05 s step that is independent of the boot's progress curve.
 */
function pullCycleSec(elapsedSec: number): number {
  "worklet";

  return Math.max(
    0,
    elapsedSec - (BOOT_DURATION_MS / 1000) * PULL_START_PROGRESS,
  );
}

/** Which pullable layer is being inspected — an index into `PULLABLE_PANELS`. */
export function pulledPanelIndex(elapsedSec: number): number {
  "worklet";

  return (
    Math.floor(pullCycleSec(elapsedSec) / PULL_STEP_SEC) %
    PULLABLE_PANELS.length
  );
}

/** How far the inspected layer has travelled toward the camera, 0 → 1 → 0. */
export function pullAmount(elapsedSec: number, progress: number): number {
  "worklet";

  if (!pullActive(progress)) {
    return 0;
  }

  const phase = (pullCycleSec(elapsedSec) % PULL_STEP_SEC) / PULL_STEP_SEC;

  return Math.sin(Math.PI * phase);
}

/** A panel's world-space rect at this moment. */
export interface LayerWorldRect {
  readonly x0: number;
  readonly y0: number;
  readonly width: number;
  readonly height: number;
  readonly z: number;
}

/**
 * Map a panel's normalised rect into world space, including its z-explode and
 * any pull toward the camera.
 */
export function panelWorldRect(
  panel: LayerPanel,
  spread: number,
  pull: number,
): LayerWorldRect {
  "worklet";

  return {
    x0: (panel.x - 0.5) * LAYERS_WORLD_WIDTH,
    y0: (panel.y - 0.5) * LAYERS_WORLD_HEIGHT,
    width: panel.w * LAYERS_WORLD_WIDTH,
    height: panel.h * LAYERS_WORLD_HEIGHT,
    z: panel.z * spread * LAYERS_Z_SPREAD_FACTOR + LAYERS_PULL_DEPTH * pull,
  };
}

/** How far a panel has drawn in, staggered by its index in `LAYER_PANELS`. */
export function panelDrawPhase(panelIndex: number, progress: number): number {
  "worklet";

  return clamp01((progress - 0.02 - panelIndex * 0.014) / 0.09);
}

/** A panel's opacity — nearer layers read stronger, and the pulled one lifts. */
export function panelAlpha(
  centerZ: number,
  drawPhase: number,
  isPulled: boolean,
): number {
  "worklet";

  return (
    (0.35 + 0.45 * clamp01((0.6 - centerZ) / 1.2)) *
    drawPhase *
    (isPulled ? 1.15 : 1)
  );
}

/** Where the scan sweep sits on the inspected panel, 0 → 1, wrapping. */
export function pullScanV(elapsedSec: number): number {
  "worklet";

  return (elapsedSec * 1.4) % 1;
}

/** The whole-frame flicker — a fast shimmer plus a rare dropout to 55%. */
export function layersFlicker(elapsedSec: number): number {
  "worklet";

  const shimmer =
    0.88 + 0.12 * Math.sin(elapsedSec * 34 + Math.sin(elapsedSec * 8) * 4);

  if (hashRandom(Math.floor(elapsedSec * 6) + 7) > 0.94) {
    return shimmer * 0.55;
  }

  return shimmer;
}

/** One of the two dashed arc rings drifting behind the stack. */
export interface LayersArcRing {
  readonly radiusFactor: number;
  readonly dash: readonly number[];
  readonly sweep: number;
  readonly spinRate: number;
}

/** The two dashed arc rings behind the stack, counter-drifting. */
export const LAYERS_ARC_RINGS: readonly LayersArcRing[] = [
  { radiusFactor: 1.18, dash: [10, 14], sweep: 5.4, spinRate: 0.2 },
  { radiusFactor: 1.3, dash: [2, 9], sweep: 5.8, spinRate: -0.13 },
];

/** An arc ring's start angle at `elapsedSec`. */
export function arcRingStart(ring: LayersArcRing, elapsedSec: number): number {
  "worklet";

  return elapsedSec * ring.spinRate;
}

/** The four corner telemetry readouts. */
export interface LayersTelemetry {
  readonly title: string;
  readonly layers: string;
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
 * platform tracks a gyroscope rather than a cursor. Deviating would invent
 * copy the design never approved, and the visual golden pins whatever is
 * written here; if the wording should change it is a design decision, not a
 * porting one.
 */
export function layersTelemetry(
  spread: number,
  yaw: number,
  pitch: number,
): LayersTelemetry {
  "worklet";

  return {
    title: `${BOOT_TELEMETRY_BULLET} UI COMPOSITOR · LAYER VIEW`,
    layers: `LAYERS 07 · Z-SPREAD ${Math.round(spread * 100)}%`,
    orientation: `YAW ${(yaw * 57.29).toFixed(1)}°  PITCH ${(pitch * 57.29).toFixed(1)}°`,
    track: "CURSOR TRACK · LIVE",
  };
}

/** Which accent the status banner takes. */
type LayersStatusTone = "accent" | "accentAlt" | "positive";

/** The status banner's text and tone. */
export interface LayersStatus {
  readonly text: string;
  readonly tone: LayersStatusTone;
}

/**
 * The status ladder.
 *
 * Four states, and note the third interpolates the layer currently being
 * inspected — which is why this needs `elapsedSec` as well as `progress`.
 * `label.slice(6)` strips the `"L0n · "` prefix, verbatim from the web.
 *
 * The final state takes the POSITIVE accent, not the alt — a third colour the
 * other scenes' two-way `useAltAccent` flag could not express.
 */
export function layersStatus(
  progress: number,
  elapsedSec: number,
): LayersStatus {
  "worklet";

  if (progress >= 0.92) {
    return { text: "RECOMPOSITING ▸ LAUNCH", tone: "positive" };
  }

  if (progress >= PULL_START_PROGRESS) {
    const panel = PULLABLE_PANELS[pulledPanelIndex(elapsedSec)];

    return {
      text: `LAYER INSPECTION ▸ ${panel.label.slice(6)}`,
      tone: "accentAlt",
    };
  }

  if (progress >= 0.14) {
    return { text: "DECOMPOSING LAYERS", tone: "accent" };
  }

  return { text: "COMPILING INTERFACE", tone: "accent" };
}

/** The banner blinks only during the first phase, then holds solid. */
export function layersBlinkAlpha(progress: number, elapsedSec: number): number {
  "worklet";

  if (progress >= 0.14) {
    return 1;
  }

  return 0.55 + 0.45 * Math.abs(Math.sin(elapsedSec * 5));
}

/** The z-depth readout on the inspected layer's callout. */
export function panelDepthReadout(worldZ: number): string {
  "worklet";

  return `Z ${(worldZ * 100).toFixed(0)}  ·  COMPOSITE OK`;
}
