import type { Accessor } from "solid-js";
import { createSignal, onCleanup, useContext } from "solid-js";

import { computeFps, formatHeapMb, fpsTone } from "@rtc/motion-core";

import { type LiveMetrics, LiveMetricsContext } from "./LiveMetricsContext";

/** Publish cadence — one 1-second rolling window (react-scan). Also the
 *  re-render cadence: at most one small commit per second. */
const PUBLISH_MS = 1000;

const INITIAL: LiveMetrics = { fps: null, fpsTone: "dim", mem: null };

/** `performance.memory` is a non-standard Chromium-only field — not in the DOM
 *  lib types. Read it through a narrow guard; return null everywhere else. */
interface MemoryInfo {
  readonly usedJSHeapSize: number;
}

function readHeapBytes(): number | null {
  const perf = performance as Performance & { memory?: MemoryInfo };
  return perf.memory ? perf.memory.usedJSHeapSize : null;
}

/** The rAF-callback shape the motion probe recognises: `rtcDiagnosticRafLoop`
 *  marks a loop as diagnostic instrumentation, exempt from the freeze motion
 *  census — see `tests/browser/motionProbe.ts`. */
interface DiagnosticFrameLoop {
  (now: number): void;
  rtcDiagnosticRafLoop?: boolean;
}

/**
 * Solid counterpart of the react useLiveMetrics: one rAF loop, publishes once
 * per ~1s (throttle time-gated inside the loop via `performance.now()` — no
 * polling-interval timer, per grep-gate 37). Returns a frozen accessor when
 * LiveMetricsContext supplies a value.
 *
 * Deliberately NOT gated on power-saver's Freeze tier: Freeze exists to spare
 * GPU-less (VDI/Citrix) machines the paint/composite cost of decorative
 * animations, and this meter is diagnostic instrumentation — one counter
 * increment per frame plus one signal write per second — most valuable
 * exactly when the machine is struggling. The freeze motion census exempts it
 * via the `rtcDiagnosticRafLoop` marker.
 */
export function useLiveMetrics(): Accessor<LiveMetrics> {
  // The context read happens unconditionally, ahead of the early return below
  // (Biome's useHookAtTopLevel flags any `use*`-named call reached only
  // through a conditional branch, React's rules-of-hooks applied by name even
  // though Solid has no such ordering constraint).
  const frozenMetrics = useContext(LiveMetricsContext);

  if (frozenMetrics) {
    return () => {
      return frozenMetrics;
    };
  }

  const [liveMetrics, setLiveMetrics] = createSignal<LiveMetrics>(INITIAL);

  let frames = 0;
  let windowStart = performance.now();

  function loop(now: number): void {
    frames += 1;
    const elapsed = now - windowStart;

    if (elapsed >= PUBLISH_MS) {
      const fps = computeFps(frames, elapsed);
      const heap = readHeapBytes();
      setLiveMetrics({
        fps,
        fpsTone: fpsTone(fps),
        mem: heap === null ? null : formatHeapMb(heap),
      });
      frames = 0;
      windowStart = now;
    }

    raf = requestAnimationFrame(loop);
  }

  (loop as DiagnosticFrameLoop).rtcDiagnosticRafLoop = true;

  let raf = requestAnimationFrame(loop);

  onCleanup(() => {
    cancelAnimationFrame(raf);
  });

  return liveMetrics;
}
