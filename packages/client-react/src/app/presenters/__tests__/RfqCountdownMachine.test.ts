import { TestScheduler } from "rxjs/testing";
import { describe, expect, it } from "vitest";

import { createRfqCountdownMachine } from "../RfqCountdownMachine";

const TOTAL_MS = 500;
const INTERVAL = 100;

function scheduler(): TestScheduler {
  return new TestScheduler((actual, expected) => {
    expect(actual).toEqual(expected);
  });
}

interface FrameEmission {
  frame: number;
  value: number;
}

/** Create a machine with creationTimestamp = Date.now() so elapsed ≈ 0 and
 * initialRemaining === totalMs. Collect every emission with its virtual frame. */
function run(totalMs: number): Array<FrameEmission> {
  const seen: Array<FrameEmission> = [];
  const ts = scheduler();
  ts.run(({ flush }) => {
    const machine = createRfqCountdownMachine(Date.now(), totalMs);
    const sub = machine.state$.subscribe((value) => {
      return seen.push({ frame: ts.now(), value });
    });
    flush();
    sub.unsubscribe();
    machine.dispose();
  });
  return seen;
}

describe("createRfqCountdownMachine", () => {
  it("initial state equals totalMs (creationTimestamp = now → elapsed ≈ 0)", () => {
    const ts = scheduler();
    ts.run(() => {
      const machine = createRfqCountdownMachine(Date.now(), TOTAL_MS);
      let current: number | undefined;
      const sub = machine.state$.subscribe((v) => {
        current = v;
      });
      expect(current).toBe(TOTAL_MS);
      sub.unsubscribe();
      machine.dispose();
    });
  });

  it("decrements by INTERVAL on the first tick (non-vacuousness: a frozen countdown would fail this)", () => {
    const seen = run(TOTAL_MS);
    // Frame 0 is the immediate tick (timer(0, 100)), frame 100 is the first interval tick.
    const firstTick = seen.find((e) => e.frame === INTERVAL);
    expect(firstTick).toBeDefined();
    expect(firstTick?.value).toBe(TOTAL_MS - INTERVAL);
  });

  it("decrements monotonically by INTERVAL each tick", () => {
    const seen = run(TOTAL_MS);
    // state() emits the default synchronously then the timer's frame-0 tick also
    // fires at virtual frame 0, so two 500s appear at frame 0 — deduplicate by
    // taking unique (frame, value) pairs in emission order.
    const unique = seen.filter(
      (e, i, arr) =>
        i === 0 || e.frame !== arr[i - 1].frame || e.value !== arr[i - 1].value,
    );
    // Expected sequence: 500 @ 0, 400 @ 100, 300 @ 200, 200 @ 300, 100 @ 400
    // (0 is also emitted inclusively but the 0-clamp test covers it separately).
    const ticks = unique.filter((e) => e.value > 0);
    expect(ticks).toEqual([
      { frame: 0, value: 500 },
      { frame: 100, value: 400 },
      { frame: 200, value: 300 },
      { frame: 300, value: 200 },
      { frame: 400, value: 100 },
    ]);
  });

  it("clamps at 0 and emits 0 inclusively (takeWhile inclusive: true), then completes", () => {
    const seen = run(TOTAL_MS);
    // The final 0 tick must be emitted and it must never go negative.
    const lastEmission = seen[seen.length - 1];
    expect(lastEmission.value).toBe(0);
    expect(lastEmission.frame).toBe(TOTAL_MS);
    expect(seen.some((e) => e.value < 0)).toBe(false);
    // state() emits the default + the stream emits; the stream itself produces
    // (TOTAL_MS / INTERVAL) + 1 values (i=0 through i=TOTAL_MS/INTERVAL inclusive).
    // With the extra default, total = (TOTAL_MS / INTERVAL) + 2.
    expect(seen).toHaveLength(TOTAL_MS / INTERVAL + 2);
  });

  it("dispose() tears the machine down before completion (no further emissions)", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const machine = createRfqCountdownMachine(Date.now(), TOTAL_MS);
      const seen: number[] = [];
      const sub = machine.state$.subscribe((v) => {
        return seen.push(v);
      });
      // Mirror an early unmount: unsubscribe + dispose before any tick.
      sub.unsubscribe();
      machine.dispose();
      flush();
      // Only the synchronous default was observed before teardown.
      expect(seen).toEqual([TOTAL_MS]);
    });
  });
});
