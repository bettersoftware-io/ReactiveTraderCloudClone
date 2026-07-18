import { useContext, useEffect, useState } from "react";

import { computeFps, formatHeapMb, fpsTone } from "@rtc/motion-core";
import { useViewModel } from "@rtc/react-bindings";

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

/**
 * Live FPS + MEM for the HUD status bar. Runs a single rAF loop that counts
 * frames and, once ~1s has elapsed, publishes `{ fps, fpsTone, mem }` (throttle
 * time-gated inside the loop via `performance.now()` — no polling-interval
 * timer, per grep-gate 29). When `LiveMetricsContext` supplies a frozen value
 * (harnesses), the loop never starts and the frozen value is returned — see
 * ADR-005 §②. Power-saver's Freeze tier (`usePowerSaver().isFreeze`) is
 * treated the same way: the rAF loop never starts and the readout holds
 * whatever it last published (there's no meaningful FPS to report while the
 * app's own animation loops are frozen).
 */
export function useLiveMetrics(): LiveMetrics {
  const frozen = useContext(LiveMetricsContext);
  const { usePowerSaver } = useViewModel();
  const { isFreeze } = usePowerSaver();
  const [live, setLive] = useState<LiveMetrics>(INITIAL);

  useEffect(() => {
    if (frozen || isFreeze) {
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
        setLive({
          fps,
          fpsTone: fpsTone(fps),
          mem: heap === null ? null : formatHeapMb(heap),
        });
        frames = 0;
        windowStart = now;
      }

      raf = requestAnimationFrame(loop);
    }

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [frozen, isFreeze]);

  return frozen ?? live;
}
