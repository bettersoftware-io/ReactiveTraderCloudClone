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

/**
 * Solid counterpart of the react useLiveMetrics: one rAF loop, publishes once
 * per ~1s (throttle time-gated inside the loop via `performance.now()` — no
 * polling-interval timer, per grep-gate 37). Returns a frozen accessor when
 * LiveMetricsContext supplies a value.
 */
export function useLiveMetrics(): Accessor<LiveMetrics> {
  const frozen = useContext(LiveMetricsContext);

  if (frozen) {
    return () => {
      return frozen;
    };
  }

  const [live, setLive] = createSignal<LiveMetrics>(INITIAL);
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

  let raf = requestAnimationFrame(loop);
  onCleanup(() => {
    cancelAnimationFrame(raf);
  });

  return live;
}
