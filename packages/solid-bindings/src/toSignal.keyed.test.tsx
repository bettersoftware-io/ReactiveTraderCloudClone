// TDD — RED: written before `readMaybeAccessor`/`toKeyedSignal` existed in
// `#/toSignal`.
//   pnpm --filter @rtc/solid-bindings test -- toSignal.keyed  → FAIL (no export)
// GREEN: the two helpers land in toSignal.ts and the nine pure-subscription
// ViewModel hooks are rewritten on top of them.
//
// The `factoryCalls` suite at the bottom is a later RED→GREEN round: the first
// version of `toKeyedSignal` took an opaque `() => StateObservable<T>` thunk
// and re-subscribed on ANY tracked read inside it, not on a change of the key
// VALUE. Those cases measured 1 mount + 2 rebuilds under an unrelated upstream
// update; they pin the `===` gate that fixed it.
//
// These cover the SEAM itself (resolve + keyed resubscribe). The hook-level
// witnesses — accessor form, mixed two-argument form — live in
// createViewModel.streams.test.tsx alongside their value-form siblings.

import { type StateObservable, state } from "@rx-state/core";
import { BehaviorSubject } from "rxjs";
import { createRoot, createSignal } from "solid-js";
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

    expect(readMaybeAccessor(readSymbol)).toBe("GBPUSD");
  });

  it("returns undefined for an absent optional key", () => {
    expect(readMaybeAccessor(undefined)).toBeUndefined();
  });
});

describe("toKeyedSignal", () => {
  it("reads the seeded value for the initial key", () => {
    const world = makeKeyedWorld();

    createRoot((dispose) => {
      const [key] = createSignal("a");
      const value = toKeyedSignal(
        () => {
          return key();
        },
        (k) => {
          return world.keyed(k);
        },
      );

      expect(value()).toBe("a1");
      dispose();
    });
  });

  it("switches to the other key's value when the key signal changes", () => {
    const world = makeKeyedWorld();

    createRoot((dispose) => {
      const [key, setKey] = createSignal("a");
      const value = toKeyedSignal(
        () => {
          return key();
        },
        (k) => {
          return world.keyed(k);
        },
      );

      expect(value()).toBe("a1");
      setKey("b");

      expect(value()).toBe("b1");
      dispose();
    });
  });

  it("keeps tracking the NEW key's later emissions after a key change", () => {
    const world = makeKeyedWorld();

    createRoot((dispose) => {
      const [key, setKey] = createSignal("a");
      const value = toKeyedSignal(
        () => {
          return key();
        },
        (k) => {
          return world.keyed(k);
        },
      );

      setKey("b");
      world.b$.next("b2");

      expect(value()).toBe("b2");
      dispose();
    });
  });

  it("releases the previous key's subscription on a key change", () => {
    const world = makeKeyedWorld();

    createRoot((dispose) => {
      const [key, setKey] = createSignal("a");
      const value = toKeyedSignal(
        () => {
          return key();
        },
        (k) => {
          return world.keyed(k);
        },
      );

      value();

      expect(world.keyed("a").getRefCount()).toBe(1);
      setKey("b");
      value();

      expect(world.keyed("a").getRefCount()).toBe(0);
      expect(world.keyed("b").getRefCount()).toBe(1);
      dispose();
    });
  });

  it("ignores later emissions on the key it moved away from", () => {
    const world = makeKeyedWorld();

    createRoot((dispose) => {
      const [key, setKey] = createSignal("a");
      const value = toKeyedSignal(
        () => {
          return key();
        },
        (k) => {
          return world.keyed(k);
        },
      );

      setKey("b");
      world.a$.next("a2");

      expect(value()).toBe("b1");
      dispose();
    });
  });

  it("subscribes once and never resubscribes for a plain (untracked) key", () => {
    const world = makeKeyedWorld();

    createRoot((dispose) => {
      const value = toKeyedSignal("a", (k) => {
        return world.keyed(k);
      });

      expect(value()).toBe("a1");
      world.a$.next("a2");

      expect(value()).toBe("a2");
      expect(world.keyed("a").getRefCount()).toBe(1);
      dispose();
    });
  });

  it("unsubscribes the current key when the owner is disposed", () => {
    const world = makeKeyedWorld();

    createRoot((dispose) => {
      const [key, setKey] = createSignal("a");
      const value = toKeyedSignal(
        () => {
          return key();
        },
        (k) => {
          return world.keyed(k);
        },
      );

      value();
      setKey("b");
      value();
      dispose();
    });

    expect(world.keyed("a").getRefCount()).toBe(0);
    expect(world.keyed("b").getRefCount()).toBe(0);
  });
});

// The `===` gate. Every case here counts INVOCATIONS OF THE SOURCE FACTORY,
// because that is what a rebuild actually costs: `@rx-state/core` evicts a
// keyed `StateObservable` at refcount 0, so a second invocation for the same
// key means the cached instance was torn down and rebuilt — and for
// `CandleSeriesPresenter` that discards every backfilled page (its stitched$
// `defer` resets `older$`/`exhausted$` on each fresh subscription cycle).
describe("toKeyedSignal — resubscribes on the key VALUE, not on any tracked read", () => {
  it("does not rebuild when a tracked upstream signal changes but the key does not", () => {
    const world = makeCountingWorld();

    createRoot((dispose) => {
      const [workspace, setWorkspace] = createSignal({
        sel: "a",
        chartType: "candle",
      });

      const value = toKeyedSignal(
        () => {
          return workspace().sel;
        },
        (k) => {
          return world.keyed(k);
        },
      );

      value();

      expect(world.factoryCalls).toBe(1);

      // Unrelated field replaced twice — the whole object is a new reference
      // each time (EqWorkspaceMachine returns `{ ...s, chartType }`), so the
      // key accessor re-runs, but `sel` is unchanged.
      setWorkspace({ sel: "a", chartType: "line" });
      value();
      setWorkspace({ sel: "a", chartType: "bar" });
      value();

      expect(world.factoryCalls).toBe(1);
      expect(value()).toBe("a1");
      dispose();
    });
  });

  it("ChartPanel shape: a coarse state object churning in unrelated fields keeps the series subscription", () => {
    const world = makeCountingWorld();

    createRoot((dispose) => {
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

      const candles = toKeyedSignal(
        () => {
          return props.symbol;
        },
        () => {
          return props.timeframe;
        },
        (sym, tf) => {
          return world.keyed(`${sym}|${tf}`);
        },
      );

      candles();

      expect(world.factoryCalls).toBe(1);

      // toggleIndicator, then toggleYScale — neither touches sel/timeframe.
      setWorkspace({
        sel: "a",
        timeframe: "1D",
        indicators: ["sma"],
        yScale: "linear",
      });
      candles();
      setWorkspace({
        sel: "a",
        timeframe: "1D",
        indicators: ["sma"],
        yScale: "log",
      });
      candles();

      expect(world.factoryCalls).toBe(1);
      dispose();
    });
  });

  it("still rebuilds exactly once when the key value really changes", () => {
    const world = makeCountingWorld();

    createRoot((dispose) => {
      const [workspace, setWorkspace] = createSignal({
        sel: "a",
        chartType: "candle",
      });

      const value = toKeyedSignal(
        () => {
          return workspace().sel;
        },
        (k) => {
          return world.keyed(k);
        },
      );

      value();
      setWorkspace({ sel: "b", chartType: "candle" });

      expect(value()).toBe("b1");
      expect(world.factoryCalls).toBe(2);
      dispose();
    });
  });

  it("two-key form: a symbol change and a timeframe change each rebuild exactly once", () => {
    const world = makeCountingWorld();

    createRoot((dispose) => {
      const [symbol, setSymbol] = createSignal("a");
      const [timeframe, setTimeframe] = createSignal("1D");
      const value = toKeyedSignal(
        () => {
          return symbol();
        },
        () => {
          return timeframe();
        },
        (sym, tf) => {
          return world.keyed(`${sym}|${tf}`);
        },
      );

      value();

      expect(world.factoryCalls).toBe(1);
      setSymbol("b");
      value();

      expect(world.factoryCalls).toBe(2);
      setTimeframe("1W");
      value();

      expect(world.factoryCalls).toBe(3);
      dispose();
    });
  });

  it("an object key compares by reference: the same instance re-read does not rebuild", () => {
    const world = makeCountingWorld();
    const eurusd = { symbol: "a" };

    createRoot((dispose) => {
      const [wrapper, setWrapper] = createSignal({ pair: eurusd, hovered: 0 });
      const value = toKeyedSignal(
        () => {
          return wrapper().pair;
        },
        (pair: PairKey) => {
          return world.keyed(pair.symbol);
        },
      );

      value();
      setWrapper({ pair: eurusd, hovered: 1 });
      value();

      expect(world.factoryCalls).toBe(1);
      dispose();
    });
  });

  it("invokes the source factory exactly once for a plain value key", () => {
    const world = makeCountingWorld();

    createRoot((dispose) => {
      const value = toKeyedSignal("a", (k) => {
        return world.keyed(k);
      });

      value();
      world.a$.next("a2");
      value();

      expect(world.factoryCalls).toBe(1);
      expect(value()).toBe("a2");
      dispose();
    });
  });
});

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
function makeKeyedWorld(): KeyedWorld {
  const a$ = new BehaviorSubject("a1");
  const b$ = new BehaviorSubject("b1");
  const keyed = state((key: string) => {
    return key === "a" ? a$ : b$;
  }, "");

  return { a$, b$, keyed };
}

interface CountingWorld extends KeyedWorld {
  /** Invocations of the keyed `state()` factory. `@rx-state/core` calls it
   * once per CACHED instance, so a second call for the same key proves the
   * instance was evicted at refcount 0 and rebuilt. */
  readonly factoryCalls: number;
}

function makeCountingWorld(): CountingWorld {
  const a$ = new BehaviorSubject("a1");
  const b$ = new BehaviorSubject("b1");
  let factoryCalls = 0;
  const keyed = state((key: string) => {
    factoryCalls += 1;

    return key.startsWith("a") ? a$ : b$;
  }, "");

  return {
    a$,
    b$,
    keyed,
    get factoryCalls(): number {
      return factoryCalls;
    },
  };
}
