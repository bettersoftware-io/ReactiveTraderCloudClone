import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  type AppPorts,
  createApp,
  createMachineFactories,
  createSimulatorPorts,
  InMemorySessionStore,
} from "@rtc/client-core";
import {
  AuthSimulator,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";

import { createViewModel, type ViewModel } from "#/createViewModel";

afterEach(cleanup);

/**
 * Regression test for the CRITICAL equities-tab white-screen crash: the very
 * FIRST render of any component calling useEqWorkspace() must already see the
 * machine's real warm state, never the "nothing selected" placeholder — that
 * placeholder briefly leaking through on first render is exactly what let
 * ChartPanel call useCandles("", ...) and crash the whole app with no
 * ErrorBoundary to catch it (see createViewModel.ts's useEqWorkspaceState doc
 * comment).
 *
 * This can't be proven by reading `result.current` after `renderHook()`
 * returns (see the existing "useEqWorkspace starts selected on the first
 * watchlist symbol..." test in createViewModel.equities.test.ts): Testing
 * Library's `act()` wrapper flushes passive effects before control returns to
 * the test, so a hook whose value is only CORRECT after its own effect runs
 * would already look correct there — hiding exactly the bug this fixes,
 * which manifests only on the render that happens BEFORE any effect flush
 * (a real browser's first paint). Capturing the value from inside the
 * render body itself (pushed into `renders` as a side effect of rendering,
 * not read afterwards) observes the pre-effect-flush value directly.
 */
describe("createViewModel — useEqWorkspace first-render value (equities white-screen regression)", () => {
  it("the FIRST render already reports the seeded watchlist symbol, never the empty placeholder", () => {
    const hooks = makeHooks();
    const renders: string[] = [];

    function Probe(): null {
      const { state } = hooks.useEqWorkspace();
      renders.push(state.sel);
      return null;
    }

    render(<Probe />);

    expect(renders.length).toBeGreaterThan(0);
    expect(renders[0]).toBe("AAPL");
    expect(renders[0]).not.toBe("");
  });
});

function makeHooks(): ViewModel {
  const { presenters, commands } = createApp(createSimPorts());
  return createViewModel(
    presenters,
    createMachineFactories(presenters),
    commands,
  );

  function createSimPorts(): AppPorts {
    return {
      ...createSimulatorPorts({
        preferences: new PreferencesSimulator(),
        auth: new AuthSimulator({}),
        sessionStore: new InMemorySessionStore(),
      }),
      connectionEvents: new ConnectionEventsSimulator(),
    };
  }
}
