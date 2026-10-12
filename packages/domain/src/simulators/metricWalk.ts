import {
  concat,
  defer,
  finalize,
  from,
  interval,
  map,
  type Observable,
  share,
} from "rxjs";

import type { MetricSample } from "../telemetry/metrics.js";

/** Cadence shared by every telemetry metric stream (PROTO ticks ~1s). */
export const METRIC_TICK_MS = 1_000;

/**
 * Samples pre-seeded per stream on subscribe — fills the charts' 60-sample
 * rolling window (`METRIC_WINDOW`, which each core's windowed samples keep) so every metric chart
 * renders dense from the very first frame instead of building up over a
 * minute of live ticks.
 */
export const METRIC_HISTORY_LEN = 60;

/** A clamped-random-walk regime: recenter point, per-tick step and bounds. */
export interface WalkCfg {
  readonly center: number;
  readonly step: number;
  readonly min: number;
  readonly max: number;
}

// PROTO adminData.ts stepSeries (L1136): a correlated walk — each tick moves
// ±step/2 from the previous value, clamped into [min, max]. This is what
// makes the series read as a living metric rather than i.i.d. white noise.
export function walkStep(
  prev: number,
  cfg: WalkCfg,
  rng: () => number,
): number {
  const next = prev + (rng() - 0.5) * cfg.step;
  return Math.max(cfg.min, Math.min(cfg.max, next));
}

/**
 * A full backdated history window: METRIC_HISTORY_LEN samples spaced one
 * METRIC_TICK_MS apart with the newest at `Date.now()`, each value drawn from
 * the caller's walk (PROTO adminData.ts `gs` seeding, L809). Timestamps are
 * derived from Date.now() only as sample-time metadata — never as PRNG seeds.
 */
function seedHistory(nextValue: () => number): MetricSample[] {
  const now = Date.now();
  return Array.from({ length: METRIC_HISTORY_LEN }, (_, i) => {
    return {
      t: now - (METRIC_HISTORY_LEN - 1 - i) * METRIC_TICK_MS,
      value: nextValue(),
    };
  });
}

/**
 * One metric's stream — a seeded history window, then a sample per
 * METRIC_TICK_MS — as ONE walk for every subscriber. The first subscriber
 * starts the tick loop, later ones join it, and it stops with the last.
 *
 * `nextValue` advances state its simulator owns, so a loop per subscriber
 * would step the walk once per subscriber, and seeding a fresh history for
 * each newcomer would throw it METRIC_HISTORY_LEN steps ahead under everyone
 * already listening. A subscriber joining a running walk is therefore
 * replayed the window the walk has kept, not a new one; a fresh window is
 * drawn only when no walk is running, when there is nobody to disturb.
 */
export function createMetricStream(
  nextValue: () => number,
): Observable<MetricSample> {
  let window: MetricSample[] = [];
  let running = false;

  const live$ = defer(() => {
    running = true;
    return interval(METRIC_TICK_MS).pipe(
      map(() => {
        const sample: MetricSample = { t: Date.now(), value: nextValue() };
        window.push(sample);

        if (window.length > METRIC_HISTORY_LEN) {
          window.shift();
        }

        return sample;
      }),
      finalize(() => {
        running = false;
      }),
    );
  }).pipe(share());

  return defer(() => {
    if (!running) {
      window = seedHistory(nextValue);
    }

    return concat(from([...window]), live$);
  });
}
