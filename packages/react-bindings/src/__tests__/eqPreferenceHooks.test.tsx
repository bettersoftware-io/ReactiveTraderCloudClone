import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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

describe("equities watchlist-sort / blotter-view preference hooks", () => {
  it("useEqWatchlistSort reads default chg and sets sym", () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.useEqWatchlistSort();
    });
    expect(result.current.sort).toBe("chg");
    act(() => {
      result.current.setSort("sym");
    });
    expect(result.current.sort).toBe("sym");
  });

  it("useEqWatchlistSort().cycle() advances sym → chg → price → sym", () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.useEqWatchlistSort();
    });
    act(() => {
      result.current.setSort("sym");
    });

    act(() => {
      result.current.cycle();
    });
    expect(result.current.sort).toBe("chg");

    act(() => {
      result.current.cycle();
    });
    expect(result.current.sort).toBe("price");

    act(() => {
      result.current.cycle();
    });
    expect(result.current.sort).toBe("sym");
  });

  it("useEqBlotterView reads default orders and sets positions", () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.useEqBlotterView();
    });
    expect(result.current.view).toBe("orders");
    act(() => {
      result.current.setView("positions");
    });
    expect(result.current.view).toBe("positions");
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
