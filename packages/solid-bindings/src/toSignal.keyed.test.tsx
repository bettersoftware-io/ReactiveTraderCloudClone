// TDD — RED: written before `readMaybeAccessor`/`toKeyedSignal` existed in
// `#/toSignal`.
//   pnpm --filter @rtc/solid-bindings test -- toSignal.keyed  → FAIL (no export)
// GREEN: the two helpers land in toSignal.ts and the nine pure-subscription
// ViewModel hooks are rewritten on top of them.
//
// The `sourceCalls` suite at the bottom is a later RED→GREEN round: the first
// version of `toKeyedSignal` took an opaque `() => StateObservable<T>` thunk
// and re-subscribed on ANY tracked read inside it, not on a change of the key
// VALUE. Those cases measured 1 mount + 2 rebuilds under an unrelated upstream
// update; they pin the `===` gate that fixed it. (Under Solid 1 they counted
// the keyed `state()` FACTORY's calls, because each rebuild evicted and
// rebuilt the cached instance. Solid 2 runs a memo's new compute before the
// previous run's cleanup, so the old subscription outlives the new one's
// subscribe and the refcount never reaches 0: a rebuild no longer evicts, it
// churns a subscription. The cases now count the calls the seam makes to
// `source`, which is the rebuild itself.)
//
// These cover the SEAM itself (resolve + keyed resubscribe). The hook-level
// witnesses — accessor form, mixed two-argument form — live in
// createViewModel.streams.test.tsx alongside their value-form siblings.

import { type StateObservable, state } from "@rx-state/core";
import { BehaviorSubject } from "rxjs";
import { createRoot, createSignal, flush } from "solid-js";
import { describe, expect, it } from "vitest";

import { readMaybeAccessor, toKeyedSignal } from "#/toSignal";

describe("readMaybeAccessor", () => {
  it("returns a plain value unchanged", () => {
    expect(readMaybeAccessor(7)).toBe(7);
    expect(readMaybeAccessor("EURUSD")).toBe("EURUSD");
  });

  it("returns a plain object key unchanged (no key type here is callable)", () => {
    const pair = { symbol: "EURUSD" };

    expect(readMaybeAccessor(pair)).toBe(pair);
  });

  it("calls an accessor and returns its CURRENT value", () => {
    // A plain closure, not a signal: the resolver's contract is "call it and
    // return what comes back", and tracking is toKeyedSignal's job (proven
    // below), so a signal here would only drag the read out of tracked scope.
    let symbol = "EURUSD";

    function readSymbol(): string {
      return symbol;
    }

    expect(readMaybeAccessor(readSymbol)).toBe("EURUSD");
    symbol = "GBPUSD";

    flush();
    expect(readMaybeAccessor(readSymbol)).toBe("GBPUSD");
  });

  it("returns undefined for an absent optional key", () => {
    expect(readMaybeAccessor(undefined)).toBeUndefined();
  });
});

// Solid 2 rules these cases follow: a signal write inside an owned scope (the
// `createRoot` callback is one) throws in dev, so each case builds its
// signals and the keyed signal inside `createUnderRoot` and WRITES outside
// it; and a write is applied at the next microtask, so a case `flush()`es before it
// reads what the write changed.
describe("toKeyedSignal", () => {
  it("reads the seeded value for the initial key", () => {
    const world = createKeyedWorld();
    const { value, dispose } = createUnderRoot(() => {
      return {
        value: toKeyedSignal(
          () => {
            return "a";
          },
          (k) => {
            return world.keyed(k);
          },
        ),
      };
    });

    expect(value()).toBe("a1");
    dispose();
  });

  it("switches to the other key's value when the key signal changes", () => {
    const world = createKeyedWorld();
    const { value, setKey, dispose } = mountOnKeySignal(world);

    expect(value()).toBe("a1");
    setKey("b");
    flush();

    expect(value()).toBe("b1");
    dispose();
  });

  it("keeps tracking the NEW key's later emissions after a key change", () => {
    const world = createKeyedWorld();
    const { value, setKey, dispose } = mountOnKeySignal(world);

    setKey("b");
    flush();
    world.b$.next("b2");
    flush();

    expect(value()).toBe("b2");
    dispose();
  });

  it("releases the previous key's subscription on a key change", () => {
    const world = createKeyedWorld();
    const { setKey, dispose } = mountOnKeySignal(world);

    expect(world.keyed("a").getRefCount()).toBe(1);
    setKey("b");
    flush();

    expect(world.keyed("a").getRefCount()).toBe(0);
    expect(world.keyed("b").getRefCount()).toBe(1);
    dispose();
  });

  it("ignores later emissions on the key it moved away from", () => {
    const world = createKeyedWorld();
    const { value, setKey, dispose } = mountOnKeySignal(world);

    setKey("b");
    flush();
    world.a$.next("a2");
    flush();

    expect(value()).toBe("b1");
    dispose();
  });

  it("subscribes once and never resubscribes for a plain (untracked) key", () => {
    const world = createKeyedWorld();
    const { value, dispose } = createUnderRoot(() => {
      return {
        value: toKeyedSignal("a", (k) => {
          return world.keyed(k);
        }),
      };
    });

    expect(value()).toBe("a1");
    world.a$.next("a2");
    flush();

    expect(value()).toBe("a2");
    expect(world.keyed("a").getRefCount()).toBe(1);
    dispose();
  });

  it("unsubscribes the current key when the owner is disposed", () => {
    const world = createKeyedWorld();
    const { setKey, dispose } = mountOnKeySignal(world);

    setKey("b");
    flush();
    dispose();

    expect(world.keyed("a").getRefCount()).toBe(0);
    expect(world.keyed("b").getRefCount()).toBe(0);
  });
});

// The `===` gate. Every case here counts the seam's calls to `source`: each
// one is a rebuild — a fresh `toSignal`, a subscribe to the new instance and
// an unsubscribe from the old — for a key whose value never moved.
describe("toKeyedSignal — resubscribes on the key VALUE, not on any tracked read", () => {
  it("does not rebuild when a tracked upstream signal changes but the key does not", () => {
    const world = createCountingWorld();
    const { value, setWorkspace, dispose } = createUnderRoot(() => {
      const [workspace, setWorkspace] = createSignal({
        sel: "a",
        chartType: "candle",
      });

      return {
        setWorkspace,
        value: toKeyedSignal(
          () => {
            return workspace().sel;
          },
          (k) => {
            return world.keyed(k);
          },
        ),
      };
    });

    expect(world.sourceCalls).toBe(1);

    // Unrelated field replaced twice — the whole object is a new reference
    // each time (EqWorkspaceMachine returns `{ ...s, chartType }`), so the
    // key accessor re-runs, but `sel` is unchanged.
    setWorkspace({ sel: "a", chartType: "line" });
    flush();
    setWorkspace({ sel: "a", chartType: "bar" });
    flush();

    expect(world.sourceCalls).toBe(1);
    expect(value()).toBe("a1");
    dispose();
  });

  it("ChartPanel shape: a coarse state object churning in unrelated fields keeps the series subscription", () => {
    const world = createCountingWorld();
    const { setWorkspace, dispose } = createUnderRoot(() => {
      // `<ChartBody symbol={state().sel} timeframe={state().timeframe} />` —
      // both props are getters over the WHOLE eqWorkspace state object.
      const [workspace, setWorkspace] = createSignal({
        sel: "a",
        timeframe: "1D",
        indicators: [] as readonly string[],
        yScale: "linear",
      });

      const props = {
        get symbol(): string {
          return workspace().sel;
        },
        get timeframe(): string {
          return workspace().timeframe;
        },
      };

      return {
        setWorkspace,
        candles: toKeyedSignal(
          () => {
            return props.symbol;
          },
          () => {
            return props.timeframe;
          },
          (sym, tf) => {
            return world.keyed(`${sym}|${tf}`);
          },
        ),
      };
    });

    expect(world.sourceCalls).toBe(1);

    // toggleIndicator, then toggleYScale — neither touches sel/timeframe.
    setWorkspace({
      sel: "a",
      timeframe: "1D",
      indicators: ["sma"],
      yScale: "linear",
    });
    flush();
    setWorkspace({
      sel: "a",
      timeframe: "1D",
      indicators: ["sma"],
      yScale: "log",
    });
    flush();

    expect(world.sourceCalls).toBe(1);
    dispose();
  });

  it("still rebuilds exactly once when the key value really changes", () => {
    const world = createCountingWorld();
    const { value, setWorkspace, dispose } = createUnderRoot(() => {
      const [workspace, setWorkspace] = createSignal({
        sel: "a",
        chartType: "candle",
      });

      return {
        setWorkspace,
        value: toKeyedSignal(
          () => {
            return workspace().sel;
          },
          (k) => {
            return world.keyed(k);
          },
        ),
      };
    });

    setWorkspace({ sel: "b", chartType: "candle" });
    flush();

    expect(value()).toBe("b1");
    expect(world.sourceCalls).toBe(2);
    dispose();
  });

  it("two-key form: a symbol change and a timeframe change each rebuild exactly once", () => {
    const world = createCountingWorld();
    const { setSymbol, setTimeframe, dispose } = createUnderRoot(() => {
      const [symbol, setSymbol] = createSignal("a");
      const [timeframe, setTimeframe] = createSignal("1D");

      return {
        setSymbol,
        setTimeframe,
        value: toKeyedSignal(
          () => {
            return symbol();
          },
          () => {
            return timeframe();
          },
          (sym, tf) => {
            return world.keyed(`${sym}|${tf}`);
          },
        ),
      };
    });

    expect(world.sourceCalls).toBe(1);
    setSymbol("b");
    flush();

    expect(world.sourceCalls).toBe(2);
    setTimeframe("1W");
    flush();

    expect(world.sourceCalls).toBe(3);
    dispose();
  });

  it("an object key compares by reference: the same instance re-read does not rebuild", () => {
    const world = createCountingWorld();
    const eurusd = { symbol: "a" };
    const { setWrapper, dispose } = createUnderRoot(() => {
      const [wrapper, setWrapper] = createSignal({ pair: eurusd, hovered: 0 });

      return {
        setWrapper,
        value: toKeyedSignal(
          () => {
            return wrapper().pair;
          },
          (pair: PairKey) => {
            return world.keyed(pair.symbol);
          },
        ),
      };
    });

    setWrapper({ pair: eurusd, hovered: 1 });
    flush();

    expect(world.sourceCalls).toBe(1);
    dispose();
  });

  it("invokes the source factory exactly once for a plain value key", () => {
    const world = createCountingWorld();
    const { value, dispose } = createUnderRoot(() => {
      return {
        value: toKeyedSignal("a", (k) => {
          return world.keyed(k);
        }),
      };
    });

    world.a$.next("a2");
    flush();

    expect(world.sourceCalls).toBe(1);
    expect(value()).toBe("a2");
    dispose();
  });
});

/** Runs `build` under a fresh root and hands back what it built plus the
 * root's `dispose` — so a case can write to its signals from OUTSIDE the
 * owned scope, as an event handler would. */
function createUnderRoot<T extends object>(build: () => T): Rooted<T> {
  return createRoot((dispose) => {
    return { ...build(), dispose };
  });
}

/** What `createUnderRoot` built, plus the root's `dispose`. */
type Rooted<T> = T & RootDisposer;

interface RootDisposer {
  dispose: () => void;
}

interface KeySignalMount {
  value: () => string;
  setKey: (key: string) => void;
  dispose: () => void;
}

/** The common shape: one key signal starting at "a", keying `world`. */
function mountOnKeySignal(world: KeyedWorld): KeySignalMount {
  return createUnderRoot(() => {
    const [key, setKey] = createSignal("a");

    return {
      setKey: (next: string): void => {
        setKey(next);
      },
      value: toKeyedSignal(
        () => {
          return key();
        },
        (k) => {
          return world.keyed(k);
        },
      ),
    };
  });
}

/** A reference-compared object key, standing in for `CurrencyPair`. */
interface PairKey {
  symbol: string;
}

interface KeyedWorld {
  a$: BehaviorSubject<string>;
  b$: BehaviorSubject<string>;
  keyed: (key: string) => StateObservable<string>;
}

/** Two warm per-key sources behind one `@rx-state/core` keyed `state()` —
 * the same shape `createViewModel`'s priceState/candlesState/depthState use,
 * so refcount assertions here mean what they mean in production. */
function createKeyedWorld(): KeyedWorld {
  const a$ = new BehaviorSubject("a1");
  const b$ = new BehaviorSubject("b1");
  const keyed = state((key: string) => {
    return key === "a" ? a$ : b$;
  }, "");

  return { a$, b$, keyed };
}

interface CountingWorld extends KeyedWorld {
  /** Calls the seam made to `keyed` — one per (re)build of the keyed
   * subscription. */
  readonly sourceCalls: number;
}

function createCountingWorld(): CountingWorld {
  const world = createKeyedWorld();
  let sourceCalls = 0;

  return {
    a$: world.a$,
    b$: world.b$,
    keyed: (key: string): StateObservable<string> => {
      sourceCalls += 1;

      return world.keyed(key.startsWith("a") ? "a" : "b");
    },
    get sourceCalls(): number {
      return sourceCalls;
    },
  };
}
