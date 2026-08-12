import { useContext, useEffect, useState } from "react";

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
 * Live FPS + MEM for the HUD status bar. Runs a single rAF loop that counts
 * frames and, once ~1s has elapsed, publishes `{ fps, fpsTone, mem }` (throttle
 * time-gated inside the loop via `performance.now()` — no polling-interval
 * timer, per grep-gate 29). When `LiveMetricsContext` supplies frozen metrics
 * (harnesses), the loop never starts and that value is returned — see
 * ADR-005 §②.
 *
 * Deliberately NOT gated on power-saver's Freeze tier: Freeze exists to spare
 * GPU-less (VDI/Citrix) machines the paint/composite cost of decorative
 * animations, and this meter is diagnostic instrumentation — one counter
 * increment per frame plus one state commit per second — most valuable
 * exactly when the machine is struggling. The freeze motion census exempts it
 * via the `rtcDiagnosticRafLoop` marker.
 */
export function useLiveMetrics(): LiveMetrics {
  const frozenMetrics = useContext(LiveMetricsContext);
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics>(INITIAL);

  useEffect(() => {
    if (frozenMetrics) {
      return;
    }

    let raf = 0;
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

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [frozenMetrics]);

  return frozenMetrics ?? liveMetrics;
}
