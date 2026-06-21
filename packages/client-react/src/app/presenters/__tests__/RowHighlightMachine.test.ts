import { TestScheduler } from "rxjs/testing";
import { describe, expect, it } from "vitest";
import {
  createRowHighlightMachine,
  HIGHLIGHT_MS,
} from "../RowHighlightMachine";

function scheduler() {
  return new TestScheduler((actual, expected) => {
    expect(actual).toEqual(expected);
  });
}

/** Build the machine for a given `isNew` and collect every flag emission with
 * the virtual frame at which it occurred. */
function run(isNew: boolean): Array<{ frame: number; value: boolean }> {
  const seen: Array<{ frame: number; value: boolean }> = [];
  const ts = scheduler();
  ts.run(({ flush }) => {
    const machine = createRowHighlightMachine(isNew);
    const sub = machine.state$.subscribe((value) =>
      seen.push({ frame: ts.now(), value }),
    );
    flush();
    sub.unsubscribe();
    machine.dispose();
  });
  return seen;
}

describe("createRowHighlightMachine", () => {
  it("starts true synchronously for a new row", () => {
    const ts = scheduler();
    ts.run(() => {
      const machine = createRowHighlightMachine(true);
      let current: boolean | undefined;
      const sub = machine.state$.subscribe((v) => (current = v));
      expect(current).toBe(true);
      sub.unsubscribe();
      machine.dispose();
    });
  });

  it("starts false synchronously for a non-new row", () => {
    const ts = scheduler();
    ts.run(() => {
      const machine = createRowHighlightMachine(false);
      let current: boolean | undefined;
      const sub = machine.state$.subscribe((v) => (current = v));
      expect(current).toBe(false);
      sub.unsubscribe();
      machine.dispose();
    });
  });

  it("a new row highlights, then clears at exactly HIGHLIGHT_MS (never before)", () => {
    const seen = run(true);
    // Exactly two emissions: true at frame 0, false at frame HIGHLIGHT_MS.
    expect(seen).toEqual([
      { frame: 0, value: true },
      { frame: HIGHLIGHT_MS, value: false },
    ]);
    // The flip happens AT HIGHLIGHT_MS — not before. (Re-asserts the frame so a
    // regression to an earlier/later timer is caught explicitly.)
    const flip = seen.find((e) => e.value === false);
    expect(flip?.frame).toBe(HIGHLIGHT_MS);
  });

  it("a non-new row is false only and never flips to true", () => {
    const seen = run(false);
    expect(seen).toEqual([{ frame: 0, value: false }]);
    expect(seen.some((e) => e.value === true)).toBe(false);
  });

  it("dispose() + unsubscribe tears the machine down before the timer fires", () => {
    const ts = scheduler();
    ts.run(({ flush }) => {
      const machine = createRowHighlightMachine(true);
      const seen: boolean[] = [];
      const sub = machine.state$.subscribe((v) => seen.push(v));
      // Mirror an early unmount: unsubscribe + dispose before HIGHLIGHT_MS, so
      // the refCounted stream tears down and the timer never reaches the clear.
      sub.unsubscribe();
      machine.dispose();
      flush();
      // Only the synchronous default (true) was observed before teardown.
      expect(seen).toEqual([true]);
    });
  });
});
