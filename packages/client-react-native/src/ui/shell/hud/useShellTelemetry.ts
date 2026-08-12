// packages/client-react-native/src/ui/shell/hud/useShellTelemetry.ts
import { useContext, useState } from "react";
import {
  runOnJS,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";

import { computeFps, fpsTone, type MetricTone } from "@rtc/motion-core";

import { ShellTelemetryContext } from "./ShellTelemetryContext";

/** HUD status-strip telemetry. FPS is a live rolling-window meter (Reanimated
 * `useFrameCallback` → `computeFps`/`fpsTone`). Deliberately NOT gated on
 * reduced-motion or power-saver Freeze (unlike the decorative shell motion
 * behind `useShellMotionEnabled`): the meter is diagnostic instrumentation —
 * one counter increment per frame plus one commit per second — most valuable
 * exactly when the device is struggling. Mirrors the web `useLiveMetrics`
 * freeze exemption. LAT/clock/build are decorative static seeds
 * (golden-stable chrome, mirroring the web `CosmeticMetrics` design). A
 * `ShellTelemetryContext` provider (visual harness) overrides FPS + latency
 * with a frozen snapshot.
 *
 * The rolling-window counters live in `useSharedValue`s rather than a
 * per-render plain object: a plain object captured by the frame-callback
 * worklet would be re-created (and its accumulated frame count discarded) on
 * every re-render this hook itself triggers via `setFps`, and mutating a
 * fresh JS-thread object from a UI-thread worklet is exactly the pattern the
 * Reanimated worklet plugin warns about. Shared values persist across
 * renders and are the sanctioned way to mutate state from a worklet. */
export function useShellTelemetry(): ShellTelemetry {
  const frozenTelemetry = useContext(ShellTelemetryContext);
  const [fps, setFps] = useState(SEED_FPS);
  const framesSv = useSharedValue(0);
  const windowStartSv = useSharedValue(0);
  const active = frozenTelemetry === null;

  // `computeFps` is a plain @rtc/motion-core function — a Reanimated "Remote
  // Function" from the worklet's perspective. Calling it inside the worklet
  // (even in a `runOnJS(...)` argument, which is evaluated on the UI runtime)
  // crashes with "Tried to synchronously call a Remote Function on the UI
  // Runtime". Hand the raw frame count + elapsed to the JS thread and compute
  // there. Jest can't catch this — it mocks reanimated, so the worklet runs as
  // ordinary JS where `computeFps` is directly callable.
  function publishFps(frames: number, elapsedMs: number): void {
    setFps(computeFps(frames, elapsedMs));
  }

  useFrameCallback((frame) => {
    "worklet";

    if (frozenTelemetry !== null) {
      return;
    }

    framesSv.value += 1;

    // T30: THE CLOCK RESTARTS UNDER US. `useFrameCallback` registers its
    // argument in an effect keyed on the callback identity, and this one is an
    // inline arrow — a new identity every render — so every re-render
    // unregisters and re-registers it, and re-registration restarts
    // `timeSinceFirstFrame` at zero. This hook re-renders itself on each
    // `setFps`, so that happens constantly. A `windowStartSv` captured before
    // a reset is a stamp in the OLD clock's frame of reference, and
    // subtracting it from the new one yields a tiny or negative elapsed —
    // which is how the status strip reported 302, 485 and 1264 FPS on device.
    //
    // Same mechanism as T29, where every boot scene sat frozen at t=0. The fix
    // there was to hoist the callback; that repair trips
    // `react-hooks/immutability` here (the rule tolerates shared-value writes
    // in an inline `useFrameCallback` argument but not in a hoisted one), so
    // this instead detects the reset and resyncs. Frames counted against the
    // previous clock are discarded rather than divided by the wrong elapsed —
    // one dropped window is invisible; a wrong number is not.
    const restarted = frame.timeSinceFirstFrame < windowStartSv.value;

    if (windowStartSv.value === 0 || restarted) {
      windowStartSv.value = frame.timeSinceFirstFrame;
      framesSv.value = 0;
      return;
    }

    const elapsed = frame.timeSinceFirstFrame - windowStartSv.value;

    if (elapsed >= PUBLISH_MS) {
      runOnJS(publishFps)(framesSv.value, elapsed);
      framesSv.value = 0;
      windowStartSv.value = frame.timeSinceFirstFrame;
    }
  }, active);

  if (frozenTelemetry !== null) {
    return {
      fps: frozenTelemetry.fps,
      fpsTone: fpsTone(frozenTelemetry.fps),
      latencyMs: frozenTelemetry.latencyMs,
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
