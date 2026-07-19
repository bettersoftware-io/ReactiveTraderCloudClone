// packages/client-react-native/src/ui/shell/hud/useShellTelemetry.ts
import { useContext, useState } from "react";
import {
  runOnJS,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";

import { computeFps, fpsTone, type MetricTone } from "@rtc/motion-core";

import { ShellTelemetryContext } from "./ShellTelemetryContext";
import { useShellMotionEnabled } from "./useShellMotionEnabled";

/** HUD status-strip telemetry. FPS is a live rolling-window meter (Reanimated
 * `useFrameCallback` → `computeFps`/`fpsTone`), stilled at the seed under
 * reduced-motion / power-saver Freeze — there is no meaningful frame rate to
 * report while the app's own loops are frozen. LAT/clock/build are decorative
 * static seeds (golden-stable chrome, mirroring the web `CosmeticMetrics`
 * design). A `ShellTelemetryContext` provider (visual harness) overrides FPS +
 * latency with a frozen snapshot.
 *
 * The rolling-window counters live in `useSharedValue`s rather than a
 * per-render plain object: a plain object captured by the frame-callback
 * worklet would be re-created (and its accumulated frame count discarded) on
 * every re-render this hook itself triggers via `setFps`, and mutating a
 * fresh JS-thread object from a UI-thread worklet is exactly the pattern the
 * Reanimated worklet plugin warns about. Shared values persist across
 * renders and are the sanctioned way to mutate state from a worklet. */
export function useShellTelemetry(): ShellTelemetry {
  const frozen = useContext(ShellTelemetryContext);
  const enabled = useShellMotionEnabled();
  const [fps, setFps] = useState(SEED_FPS);
  const framesSv = useSharedValue(0);
  const windowStartSv = useSharedValue(0);
  const active = frozen === null && enabled;

  useFrameCallback((frame) => {
    "worklet";

    if (!active) {
      return;
    }

    framesSv.value += 1;

    if (windowStartSv.value === 0) {
      windowStartSv.value = frame.timeSinceFirstFrame;
    }

    const elapsed = frame.timeSinceFirstFrame - windowStartSv.value;

    if (elapsed >= PUBLISH_MS) {
      runOnJS(setFps)(computeFps(framesSv.value, elapsed));
      framesSv.value = 0;
      windowStartSv.value = frame.timeSinceFirstFrame;
    }
  });

  if (frozen !== null) {
    return {
      fps: frozen.fps,
      fpsTone: fpsTone(frozen.fps),
      latencyMs: frozen.latencyMs,
      clock: SEED_CLOCK,
      build: BUILD_TAG,
    };
  }

  return {
    fps,
    fpsTone: fpsTone(fps),
    latencyMs: SEED_LATENCY_MS,
    clock: SEED_CLOCK,
    build: BUILD_TAG,
  };
}

const SEED_FPS = 60;
const SEED_LATENCY_MS = 12;
const SEED_CLOCK = "09:47:03";
const BUILD_TAG = "V2.0-RN";
const PUBLISH_MS = 1000;

export interface ShellTelemetry {
  readonly fps: number;
  readonly fpsTone: MetricTone;
  readonly latencyMs: number;
  readonly clock: string;
  readonly build: string;
}
