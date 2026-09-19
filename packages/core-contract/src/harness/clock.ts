import { vi } from "vitest";

/** The clock a timer-driven suite drives. `advance` moves fake time and runs
 * every timer that falls due, awaiting the microtasks between them;
 * `settle` is the fake-clock twin of `#/harness/settle`, but MUST NOT move
 * time — it promises a due macrotask plus the microtask continuations it
 * queues (what the cores' schedulers actually use), never a nested
 * macrotask. A suite that needs a further real hop calls `clock.advance(1)`
 * itself and says why (e.g. a boundary the FX suites drive as
 * `advance(N - 1)` → `settle()` → still-not-fired → `advance(1)` →
 * fired). Measured on this repo's installed vitest 4.1.11 (sinon-backed
 * fake timers): a zero-delay timer a callback schedules DURING a firing
 * `advanceTimersByTimeAsync(0)` call does not become eligible under
 * further zero-length advances — but a microtask (`Promise.resolve().then`)
 * queued from that same callback IS picked up within the same call, which
 * is why two zero-length advances suffice here. */
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
        await vi.advanceTimersByTimeAsync(0);
      },
    });
  } finally {
    vi.useRealTimers();
  }
}
