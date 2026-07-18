import type { Accessor } from "solid-js";
import { createEffect, createSignal, onCleanup, useContext } from "solid-js";

import { computeFps, formatHeapMb, fpsTone } from "@rtc/motion-core";
import { useViewModel } from "@rtc/solid-bindings";

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
 *
 * Power-saver's Freeze tier (`usePowerSaver().isFreeze`) is treated the same
 * way: the rAF loop never starts (or is torn down, if already running) and
 * the readout holds whatever it last published — there's no meaningful FPS
 * to report while the app's own animation loops are frozen. The gate lives
 * inside a `createEffect` (not a one-time setup check) so it reacts live to
 * the preference toggling mid-session, mirroring `isFreeze()`'s accessor
 * nature (a plain boolean read at setup would freeze at mount — the same
 * trap AmbientBackground.tsx's `vars` memo comment documents).
 */
export function useLiveMetrics(): Accessor<LiveMetrics> {
  // Both context reads happen unconditionally, ahead of the `frozen` early
  // return below (Biome's useHookAtTopLevel flags any `use*`-named call
  // reached only through a conditional branch, React's rules-of-hooks
  // applied by name even though Solid has no such ordering constraint).
  const frozen = useContext(LiveMetricsContext);
  const { usePowerSaver } = useViewModel();
  const { isFreeze } = usePowerSaver();

  if (frozen) {
    return () => {
      return frozen;
    };
  }

  const [live, setLive] = createSignal<LiveMetrics>(INITIAL);

  createEffect(() => {
    if (isFreeze()) {
      return;
    }

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
  });

  return live;
}
