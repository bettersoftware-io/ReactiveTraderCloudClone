import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RfqCountdownSeed } from "@rtc/core-api";
import { RFQ_COUNTDOWN_INTERVAL_MS } from "@rtc/domain";

import { createRfqCountdownMachine } from "#/machines/rfqCountdown";

describe("createRfqCountdownMachine (async)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at totalMs − elapsed synchronously and ticks one interval per RFQ_COUNTDOWN_INTERVAL_MS to an inclusive 0", async () => {
    const m = createRfqCountdownMachine(SEED, () => {
      return CREATED_AT;
    });
    const seen: number[] = [];
    const sub = m.state$.subscribe((remainingMs) => {
      seen.push(remainingMs);
    });
    expect(seen).toEqual([TOTAL_MS]);
    await vi.advanceTimersByTimeAsync(RFQ_COUNTDOWN_INTERVAL_MS);
    expect(seen.at(-1)).toBe(TOTAL_MS - RFQ_COUNTDOWN_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(2 * RFQ_COUNTDOWN_INTERVAL_MS);
    expect(seen.at(-1)).toBe(0);
    const frozen = seen.length;
    await vi.advanceTimersByTimeAsync(2 * RFQ_COUNTDOWN_INTERVAL_MS);
    expect(seen).toHaveLength(frozen);
    sub.unsubscribe();
    m.dispose();
  });

  it("an RFQ created before its expiry starts at 0 and never ticks", async () => {
    const m = createRfqCountdownMachine(SEED, () => {
      return CREATED_AT + TOTAL_MS + 1;
    });
    const seen: number[] = [];
    const sub = m.state$.subscribe((remainingMs) => {
      seen.push(remainingMs);
    });
    expect(seen).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(seen).toEqual([0]);
    sub.unsubscribe();
    m.dispose();
  });

  it("dispose() before the first tick stops the countdown", async () => {
    const m = createRfqCountdownMachine(SEED, () => {
      return CREATED_AT;
    });
    const sub = m.state$.subscribe(() => {});
    sub.unsubscribe();
    m.dispose();
    await vi.advanceTimersByTimeAsync(TOTAL_MS);
    const fresh: number[] = [];
    m.state$
      .subscribe((remainingMs) => {
        fresh.push(remainingMs);
      })
      .unsubscribe();
    expect(fresh).toEqual([TOTAL_MS]);
  });
});

const CREATED_AT = 1_000_000;

const TOTAL_MS: number = 3 * RFQ_COUNTDOWN_INTERVAL_MS;

const SEED: RfqCountdownSeed = {
  creationTimestamp: CREATED_AT,
  totalMs: TOTAL_MS,
};
