import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Stream } from "@rtc/core-api";
import { RFQ_COUNTDOWN_INTERVAL_MS } from "@rtc/domain";

import { createRfqCountdownMachine } from "#/machines/rfqCountdown";

describe("createRfqCountdownMachine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at totalMs − elapsed synchronously and ticks one interval at a time", async () => {
    const m = createRfqCountdownMachine(1_000, TOTAL_MS, createClock(1_000));
    const seen = collect(m.state$);
    expect(seen).toEqual([TOTAL_MS]);
    await vi.advanceTimersByTimeAsync(RFQ_COUNTDOWN_INTERVAL_MS - 1);
    await settle();
    expect(seen.at(-1)).toBe(TOTAL_MS);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(seen.at(-1)).toBe(TOTAL_MS - RFQ_COUNTDOWN_INTERVAL_MS);
    m.dispose();
  });

  it("an RFQ created earlier starts lower, clamps at an inclusive 0 and then stays still", async () => {
    const m = createRfqCountdownMachine(
      1_000,
      TOTAL_MS,
      createClock(1_000 + RFQ_COUNTDOWN_INTERVAL_MS),
    );
    const seen = collect(m.state$);
    expect(seen).toEqual([TOTAL_MS - RFQ_COUNTDOWN_INTERVAL_MS]);
    await vi.advanceTimersByTimeAsync(2 * RFQ_COUNTDOWN_INTERVAL_MS);
    await settle();
    expect(seen.at(-1)).toBe(0);
    const frozen = seen.length;
    await vi.advanceTimersByTimeAsync(2 * RFQ_COUNTDOWN_INTERVAL_MS);
    await settle();
    expect(seen).toHaveLength(frozen);
    m.dispose();
  });

  it("an already-expired RFQ starts at 0 and runs no timer at all", async () => {
    const m = createRfqCountdownMachine(
      0,
      TOTAL_MS,
      createClock(10 * TOTAL_MS),
    );
    const seen = collect(m.state$);
    expect(seen).toEqual([0]);
    await vi.advanceTimersByTimeAsync(10 * TOTAL_MS);
    await settle();
    expect(seen).toEqual([0]);
    m.dispose();
  });

  it("dispose() stops the ticks; a fresh subscription still yields the current value synchronously", async () => {
    const m = createRfqCountdownMachine(1_000, TOTAL_MS, createClock(1_000));
    const seen = collect(m.state$);
    m.dispose();
    await vi.advanceTimersByTimeAsync(TOTAL_MS);
    await settle();
    expect(seen).toEqual([TOTAL_MS]);
    expect(collect(m.state$)).toEqual([TOTAL_MS]);
  });
});

/** A `now` that never moves — the countdown derives every tick from the tick
 * index, so the only thing the clock decides is the starting value. */
function createClock(at: number): () => number {
  return () => {
    return at;
  };
}

function collect(stream: Stream<number>): number[] {
  const values: number[] = [];
  stream.subscribe((value: number) => {
    values.push(value);
  });
  return values;
}

/** Two zero-length advances: no time moves, the microtask continuations an
 * Effect fiber resumes on do. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

const TOTAL_MS: number = 3 * RFQ_COUNTDOWN_INTERVAL_MS;
