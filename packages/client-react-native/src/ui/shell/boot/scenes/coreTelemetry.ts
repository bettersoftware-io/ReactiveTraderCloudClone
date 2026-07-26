// packages/client-react-native/src/ui/shell/boot/scenes/coreTelemetry.ts

import { BOOT_TELEMETRY_BULLET } from "#/ui/shell/boot/scenes/bootGlyphs";
import {
  activeFlowArcs,
  spawnedArcCount,
} from "#/ui/shell/boot/scenes/coreArcs";
import { CORE_HUBS } from "#/ui/shell/boot/scenes/coreGeometry";

/**
 * The `core` scene's screen-space furniture: the 48 calibration ticks that
 * ring the globe and the four corner telemetry strings.
 *
 * Ported verbatim from `packages/boot-splash/src/variants/bootCore.ts` —
 * ticks lines 560-576, telemetry 578-588. Deferred from phase 6a because two
 * of the four strings read the order-flow arc state, which only exists once
 * `coreArcs.ts` (Task 3) does.
 *
 * All exports carry `"worklet"` — called from `CoreScene`'s recorder worklet.
 */

export const CALIBRATION_TICK_COUNT = 48;
/** Inner/outer tick radii, as multiples of the globe radius. */
export const CALIBRATION_INNER_FACTOR = 1.86;
export const CALIBRATION_OUTER_FACTOR = 1.93;
export const CALIBRATION_LIT_ALPHA = 0.5;
export const CALIBRATION_DIM_ALPHA = 0.08;

const CALIBRATION_SWEEP_RATE = 14;

/** Whether tick `index` is in the lit arc: a head sweeps the ring at 14 ticks
 * per second and everything behind it up to the wrap point is lit. */
export function calibrationTickLit(elapsedSec: number, index: number): boolean {
  "worklet";
  return (elapsedSec * CALIBRATION_SWEEP_RATE) % CALIBRATION_TICK_COUNT > index;
}

/** The four corner strings, named by their screen position. Top-left pair is
 * left-aligned, top-right pair right-aligned (Skia has no textAlign — the
 * draw site subtracts `font.getTextWidth`). */
export interface CoreTelemetry {
  readonly topLeftFirst: string;
  readonly topLeftSecond: string;
  readonly topRightFirst: string;
  readonly topRightSecond: string;
}

export function coreTelemetryLines(
  elapsedSec: number,
  progress: number,
  yaw: number,
): CoreTelemetry {
  "worklet";
  return {
    topLeftFirst: `${BOOT_TELEMETRY_BULLET} CORE SYNC · GLOBAL MESH`,
    topLeftSecond: `NODES ${CORE_HUBS.length} · UPLINK ${Math.round(progress * 100)}%`,
    topRightFirst: `YAW ${((yaw * 57.29) % 360).toFixed(1)}°`,
    topRightSecond: `LINKS ${spawnedArcCount(elapsedSec)} · LIVE ${activeFlowArcs(elapsedSec).length}`,
  };
}

/** Telemetry text size and its inset from each screen edge, verbatim. */
export const TELEMETRY_FONT_SIZE = 11;
export const TELEMETRY_INSET = 20;
export const TELEMETRY_FIRST_BASELINE = 28;
export const TELEMETRY_SECOND_BASELINE = 44;
