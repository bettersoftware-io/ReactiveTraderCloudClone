import { TestScheduler } from "rxjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BOOT_DURATION_MS,
  BOOT_VARIANTS,
  type BootVariant,
  createBootSequenceMachine,
} from "../BootSequenceMachine";

function scheduler(): TestScheduler {
  return new TestScheduler((a, e) => {
    return expect(a).toEqual(e);
  });
}

interface DepsFixture {
  deps: {
    variant: BootVariant;
    advance: (n: BootVariant) => void;
    onDone: () => void;
  };
  advanced: BootVariant[];
  doneCount: () => number;
}

function deps(variant: BootVariant): DepsFixture {
  const advanced: BootVariant[] = [];
  let done = 0;
  return {
    deps: {
      variant,
      advance: (n: BootVariant): void => {
        advanced.push(n);
      },
      onDone: (): void => {
        done += 1;
      },
    },
    advanced,
    doneCount: (): number => {
      return done;
    },
  };
}

describe("createBootSequenceMachine", () => {
  beforeEach(() => {
    return vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
  });
  afterEach(() => {
    return vi.restoreAllMocks();
  });

  it("ramps progress 0→100 derived from the tick index and fires onDone once at the end", () => {
    const ts = scheduler();
    const { deps: d, doneCount } = deps("core");
    ts.run(({ flush }) => {
      const m = createBootSequenceMachine(d);
      const seen: number[] = [];
      const sub = m.state$.subscribe((s) => {
        return seen.push(s.progress);
      });
      flush();
      sub.unsubscribe();
      m.dispose();
      expect(seen[0]).toBe(0); // synchronous default
      expect(seen.at(-1)).toBe(100); // exact final, never overshoots
      expect(
        seen.every((p, i) => {
          return i === 0 || p >= seen[i - 1];
        }),
      ).toBe(true); // monotonic
      expect(doneCount()).toBe(1);
    });
  });

  it("advances the persisted cycle pointer to the next variant in order", () => {
    // Derive expected pairs from BOOT_VARIANTS so cycling logic is tested exhaustively.
    const cases: Array<[BootVariant, BootVariant]> = BOOT_VARIANTS.map(
      (v, i): [BootVariant, BootVariant] => {
        return [v, BOOT_VARIANTS[(i + 1) % BOOT_VARIANTS.length]];
      },
    );

    for (const [cur, next] of cases) {
      const ts = scheduler();
      const { deps: d, advanced } = deps(cur);
      ts.run(({ flush }) => {
        const m = createBootSequenceMachine(d);
        const sub = m.state$.subscribe();
        flush();
        sub.unsubscribe();
        m.dispose();
      });
      expect(advanced).toEqual([next]);
    }
  });

  it("skip() jumps straight to done at progress 100 and fires onDone once", () => {
    const ts = scheduler();
    const { deps: d, doneCount } = deps("core");
    ts.run(({ flush }) => {
      const m = createBootSequenceMachine(d);
      const seen: number[] = [];
      const sub = m.state$.subscribe((s) => {
        return seen.push(s.progress);
      });
      m.intents.skip();
      flush();
      sub.unsubscribe();
      m.dispose();
      expect(seen.at(-1)).toBe(100);
      expect(doneCount()).toBe(1);
    });
  });

  it("exposes BOOT_DURATION_MS as 4200", () => {
    expect(BOOT_DURATION_MS).toBe(4200);
  });

  it("onDone fires exactly once when skip() is called after natural ramp completion", () => {
    const ts = scheduler();
    const { deps: d, doneCount } = deps("core");
    ts.run(({ flush }) => {
      const m = createBootSequenceMachine(d);
      const sub = m.state$.subscribe();
      flush(); // ramp completes naturally — onDone should fire here
      m.intents.skip(); // skip() called again after ramp is done
      flush(); // drain any further emissions
      sub.unsubscribe();
      m.dispose();
      expect(doneCount()).toBe(1);
    });
  });

  it("onDone fires exactly once when skip() is called twice in a row", () => {
    const ts = scheduler();
    const { deps: d, doneCount } = deps("core");
    ts.run(({ flush }) => {
      const m = createBootSequenceMachine(d);
      const sub = m.state$.subscribe();
      m.intents.skip();
      m.intents.skip(); // second skip before any flush
      flush();
      sub.unsubscribe();
      m.dispose();
      expect(doneCount()).toBe(1);
    });
  });
});
