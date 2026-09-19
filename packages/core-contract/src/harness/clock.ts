import { vi } from "vitest";

/** The clock a timer-driven suite drives. `advance` moves fake time and runs
 * every timer that falls due, awaiting the microtasks between them;
 * `settle` is the fake-clock twin of `#/harness/settle`: two turns, enough
 * for a two-hop chain (port → fold → subscriber) to land on any of the
 * three cores' schedulers. NOT two zero-length advances, though the real
 * `settle` is two zero-delay `setTimeout` turns and that would be the naive
 * mirror: measured against this repo's installed vitest/sinon fake timers,
 * a zero-delay timer that a callback schedules DURING a
 * `advanceTimersByTimeAsync(0)` call never becomes eligible under any
 * number of further zero-length advances — only a later advance that
 * actually moves the clock forward picks it up. So the first turn is
 * zero-length (fires whatever is already due, without over-running a
 * longer real delay some other pending timer might hold) and the second
 * is a 1ms nudge (unsticks a hop scheduled by the first turn's callback);
 * a `settle()` on an already-quiet queue is a harmless no-op either way. */
export interface FakeClock {
  advance(ms: number): Promise<void>;
  settle(): Promise<void>;
}

/** Run one test body under vitest's fake timers, restoring real timers
 * afterwards whatever happens. Build the harness INSIDE `run` — a scheduler
 * that captured a real `setTimeout` before the swap would never advance.
 * Never call the real `settle()` inside: it waits on the real `setTimeout`,
 * which is exactly what is faked here. */
export async function withFakeClock(
  run: (clock: FakeClock) => Promise<void>,
): Promise<void> {
  vi.useFakeTimers();

  try {
    await run({
      advance: async (ms: number) => {
        await vi.advanceTimersByTimeAsync(ms);
      },
      settle: async () => {
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(1);
      },
    });
  } finally {
    vi.useRealTimers();
  }
}
