// TDD — RED: written before `readMaybeAccessor`/`toKeyedSignal` existed in
// `#/toSignal`.
//   pnpm --filter @rtc/solid-bindings test -- toSignal.keyed  → FAIL (no export)
// GREEN: the two helpers land in toSignal.ts and the nine pure-subscription
// ViewModel hooks are rewritten on top of them.
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
      const value = toKeyedSignal(() => {
        return world.keyed(key());
      });

      expect(value()).toBe("a1");
      dispose();
    });
  });

  it("switches to the other key's value when the key signal changes", () => {
    const world = makeKeyedWorld();

    createRoot((dispose) => {
      const [key, setKey] = createSignal("a");
      const value = toKeyedSignal(() => {
        return world.keyed(key());
      });

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
      const value = toKeyedSignal(() => {
        return world.keyed(key());
      });

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
      const value = toKeyedSignal(() => {
        return world.keyed(key());
      });

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
      const value = toKeyedSignal(() => {
        return world.keyed(key());
      });

      setKey("b");
      world.a$.next("a2");

      expect(value()).toBe("b1");
      dispose();
    });
  });

  it("subscribes once and never resubscribes for a plain (untracked) key", () => {
    const world = makeKeyedWorld();

    createRoot((dispose) => {
      const value = toKeyedSignal(() => {
        return world.keyed("a");
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
      const value = toKeyedSignal(() => {
        return world.keyed(key());
      });

      value();
      setKey("b");
      value();
      dispose();
    });

    expect(world.keyed("a").getRefCount()).toBe(0);
    expect(world.keyed("b").getRefCount()).toBe(0);
  });
});

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
