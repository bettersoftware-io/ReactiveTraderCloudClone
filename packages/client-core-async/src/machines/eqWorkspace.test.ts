import { BehaviorSubject, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

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

  it("an intent after dispose() is ignored", () => {
    const lifetime = new AbortController();
    const machine = createEqWorkspaceMachine(
      { initialSymbol: "AAPL" },
      lifetime.signal,
    );
    machine.dispose();

    const before = machine.state$.getValue();
    machine.intents.select("MSFT");
    expect(machine.state$.getValue()).toBe(before);
  });

  it("lifetime.abort() disposes the machine — the watchlist relay is released and a later intent is ignored", () => {
    const watchlist$ = new Subject<readonly EquityInstrument[]>();
    const lifetime = new AbortController();
    const machine = createEqWorkspaceMachine(
      { initialSymbol: "AAPL", watchlist$ },
      lifetime.signal,
    );
    expect(watchlist$.observed).toBe(true);

    lifetime.abort();
    expect(watchlist$.observed).toBe(false);

    const before = machine.state$.getValue();
    machine.intents.select("MSFT");
    expect(machine.state$.getValue()).toBe(before);
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
