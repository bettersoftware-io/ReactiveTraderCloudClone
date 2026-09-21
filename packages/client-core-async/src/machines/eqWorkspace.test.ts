import { BehaviorSubject, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { EqWorkspaceState } from "@rtc/core-api";
import type { EquityInstrument } from "@rtc/domain";

import { createEqWorkspaceMachine } from "#/machines/eqWorkspace";

describe("createEqWorkspaceMachine", () => {
  it("a synchronously-arriving roster seeds without stranding the relay — dispose() leaves the source unobserved", () => {
    const watchlist$ = new BehaviorSubject<readonly EquityInstrument[]>([AAPL]);
    const lifetime = new AbortController();
    const machine = createEqWorkspaceMachine(
      { initialSymbol: "", watchlist$ },
      lifetime.signal,
    );

    expect(machine.state$.getValue()).toMatchObject({ sel: "AAPL" });
    expect(watchlist$.observed).toBe(true);
    machine.dispose();
    expect(watchlist$.observed).toBe(false);
  });

  // A late `getValue()` is not a witness here: after `dispose()` releases the
  // keep-warm, a COLD `getValue()` returns the construction-time default
  // whether or not the guarded intent actually ran — deleting the
  // `!disposed` check would leave that assertion green. Subscribing FIRST
  // and keeping the subscription alive (so the underlying store subscription
  // survives `warm.release()` at refCount > 0) means a write the guard
  // failed to block would reach `seen` — the array growing past its
  // dispose-time length is the only thing that actually proves the guard
  // ran.
  it("an intent after dispose() is ignored", () => {
    const lifetime = new AbortController();
    const machine = createEqWorkspaceMachine(
      { initialSymbol: "AAPL" },
      lifetime.signal,
    );
    const seen: EqWorkspaceState[] = [];
    const sub = machine.state$.subscribe((v) => {
      seen.push(v);
    });
    machine.dispose();

    machine.intents.select("MSFT");
    expect(seen).toHaveLength(1);
    sub.unsubscribe();
  });

  it("lifetime.abort() disposes the machine — the watchlist relay is released and a later intent is ignored", () => {
    const watchlist$ = new Subject<readonly EquityInstrument[]>();
    const lifetime = new AbortController();
    const machine = createEqWorkspaceMachine(
      { initialSymbol: "AAPL", watchlist$ },
      lifetime.signal,
    );
    expect(watchlist$.observed).toBe(true);

    const seen: EqWorkspaceState[] = [];
    const sub = machine.state$.subscribe((v) => {
      seen.push(v);
    });

    lifetime.abort();
    expect(watchlist$.observed).toBe(false);

    machine.intents.select("MSFT");
    expect(seen).toHaveLength(1);
    sub.unsubscribe();
  });

  it("with no watchlist$ dep the workspace opens on the initial symbol alone", () => {
    const lifetime = new AbortController();
    const machine = createEqWorkspaceMachine(
      { initialSymbol: "AAPL" },
      lifetime.signal,
    );
    expect(machine.state$.getValue()).toMatchObject({
      sel: "AAPL",
      openTabs: ["AAPL"],
    });
    machine.dispose();
  });
});

const AAPL: EquityInstrument = {
  symbol: "AAPL",
  name: "Apple Inc.",
  exchange: "NASDAQ",
};
