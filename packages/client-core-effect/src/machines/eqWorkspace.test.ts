import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { Subject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EqWorkspaceState } from "@rtc/core-api";
import type { EquityInstrument } from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createEqWorkspaceMachine } from "#/machines/eqWorkspace";

describe("eqWorkspace machine", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("a roster arriving SYNCHRONOUSLY with the subscription seeds the workspace and does not strand the source", async () => {
    const roster = new Subject<readonly EquityInstrument[]>();
    const m = createEqWorkspaceMachine(useHost(), {
      initialSymbol: "",
      watchlist$: roster,
    });
    // `fromPortIn` subscribes in the machine's constructor, so a roster
    // pushed in the very next statement is not lost.
    roster.next([MSFT, AAPL]);
    await tick();
    expect(m.state$.getValue()).toMatchObject({
      sel: "MSFT",
      openTabs: ["MSFT"],
    });
    m.dispose();
    await tick();
    expect(roster.observed).toBe(false);
  });

  it("an empty roster never seeds, and only the FIRST non-empty one does", async () => {
    const roster = new Subject<readonly EquityInstrument[]>();
    const m = createEqWorkspaceMachine(useHost(), {
      initialSymbol: "",
      watchlist$: roster,
    });
    roster.next([]);
    await tick();
    expect(m.state$.getValue()).toMatchObject({ sel: "" });
    roster.next([MSFT]);
    await tick();
    expect(m.state$.getValue()).toMatchObject({ sel: "MSFT" });
    roster.next([AAPL]);
    await tick();
    expect(m.state$.getValue()).toMatchObject({ sel: "MSFT" });
    m.dispose();
  });

  it("a FAILING roster has no channel on the ref, so it is rethrown out of band and the workspace stands", async () => {
    vi.useFakeTimers();
    const host = useHost();

    try {
      const roster = new Subject<readonly EquityInstrument[]>();
      const m = createEqWorkspaceMachine(host, {
        initialSymbol: "AAPL",
        watchlist$: roster,
      });
      roster.error(new Error("roster feed"));
      // The seed fiber resumes on a microtask inside this advance and the
      // zero-delay timer `reportOutOfBand` then schedules becomes eligible
      // within the same call (the `staleFlag` idiom).
      await expect(vi.advanceTimersByTimeAsync(0)).rejects.toThrow(
        "roster feed",
      );
      const seen: EqWorkspaceState[] = [];
      m.state$.subscribe((state: EqWorkspaceState) => {
        seen.push(state);
      });
      expect(seen[0]).toMatchObject({ sel: "AAPL" });
      m.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("dispose() interrupts the seed fiber silently — an interrupt is not a failure", async () => {
    vi.useFakeTimers();
    const host = useHost();

    try {
      const roster = new Subject<readonly EquityInstrument[]>();
      const m = createEqWorkspaceMachine(host, {
        initialSymbol: "AAPL",
        watchlist$: roster,
      });
      await vi.advanceTimersByTimeAsync(0);
      m.dispose();
      // A rethrow would reject this advance, as the failing case above
      // shows it does for a real failure. What this pins is the EXTERNAL
      // interrupt path — closing the scope unwinds the fiber through its
      // finalizers only, never reaching `catchAllCause` — so it does not,
      // by itself, exercise the `Cause.isInterruptedOnly` skip branch;
      // `staleFlag` carries the identical unreached guard.
      await vi.advanceTimersByTimeAsync(0);
      expect(roster.observed).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("closing the PARENT scope releases the still-pending seed's port — no dispose() call", async () => {
    const parent = useHost();
    const roster = new Subject<readonly EquityInstrument[]>();
    createEqWorkspaceMachine(parent, {
      initialSymbol: "",
      watchlist$: roster,
    });
    await tick();
    // Non-vacuous: the seed is still pending — the roster never emitted, so
    // `take(1)` has not completed the stream and the subscription is live.
    expect(roster.observed).toBe(true);

    // `app.dispose()`'s path, without the machine's own `dispose()`: the
    // parent→child scope link is the only thing that can release this.
    await Effect.runPromise(Scope.close(parent.scope, Exit.void));
    await tick();
    expect(roster.observed).toBe(false);
  });

  it("closing the PARENT scope leaves the machine exactly as dispose() does, and a later intent is ignored", async () => {
    // See `eqDrawings.test.ts`'s twin for why the RELEASE of the keep-warm
    // is the discriminating probe: while it is held, `state()` sits at
    // refCount 1 and hands every reader its cached value, so "disposed" and
    // "frozen" look identical. Released, `getValue()` falls back to
    // `state()`'s construction-time default — the signature `dispose()`
    // produces. Without the child scope's finalizer the parent-close path
    // stays warm and reads "TSLA" here while the `dispose()` path reads the
    // default.
    const viaDispose = createEqWorkspaceMachine(useHost(), {
      initialSymbol: "AAPL",
    });
    viaDispose.intents.select("TSLA");
    await tick();
    viaDispose.dispose();
    await tick();
    const afterDispose = viaDispose.state$.getValue();

    const parent = useHost();
    const viaParent = createEqWorkspaceMachine(parent, {
      initialSymbol: "AAPL",
    });
    viaParent.intents.select("TSLA");
    await tick();
    await Effect.runPromise(Scope.close(parent.scope, Exit.void));
    await tick();
    expect(viaParent.state$.getValue()).toEqual(afterDispose);

    viaParent.intents.select("MSFT");
    await tick();
    const seen: EqWorkspaceState[] = [];
    viaParent.state$.subscribe((state: EqWorkspaceState) => {
      seen.push(state);
    });
    expect(seen[0]).toMatchObject({ sel: "TSLA" });
  });

  it("with no watchlist$ at all it opens on the initial symbol and nothing seeds it later", async () => {
    const m = createEqWorkspaceMachine(useHost(), { initialSymbol: "AAPL" });
    const seen: EqWorkspaceState[] = [];
    m.state$.subscribe((state: EqWorkspaceState) => {
      seen.push(state);
    });
    expect(seen[0]).toMatchObject({ sel: "AAPL", openTabs: ["AAPL"] });
    await tick();
    expect(seen).toHaveLength(1);
    m.dispose();
  });

  it("an intent after dispose() is ignored", async () => {
    const m = createEqWorkspaceMachine(useHost(), { initialSymbol: "AAPL" });
    m.dispose();
    m.intents.select("MSFT");
    await tick();
    // Read through a fresh SUBSCRIPTION: releasing the keep-warm drops
    // `state()`'s cached value, so the ref itself is the witness.
    const seen: EqWorkspaceState[] = [];
    m.state$.subscribe((state: EqWorkspaceState) => {
      seen.push(state);
    });
    expect(seen[0]).toMatchObject({ sel: "AAPL" });
  });

  const hosts: TestHost[] = [];

  function useHost(): TestHost {
    const host: TestHost = {
      runtime: ManagedRuntime.make(Layer.empty),
      scope: Effect.runSync(Scope.make()),
    };
    hosts.push(host);
    return host;
  }
});

interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const AAPL: EquityInstrument = {
  symbol: "AAPL",
  name: "Apple Inc.",
  exchange: "NASDAQ",
};

const MSFT: EquityInstrument = {
  symbol: "MSFT",
  name: "Microsoft Corp.",
  exchange: "NASDAQ",
};
