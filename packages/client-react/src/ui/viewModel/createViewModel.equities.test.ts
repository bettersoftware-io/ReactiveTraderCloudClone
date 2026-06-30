import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  type AppPorts,
  createApp,
  createMachineFactories,
  createSimulatorPorts,
} from "@rtc/client-core";
import { ConnectionEventsSimulator, PreferencesSimulator } from "@rtc/domain";

import { createViewModel, type ViewModel } from "./createViewModel";

describe("createViewModel — equities hooks", () => {
  it("useWatchlist is a function and returns an array by default", () => {
    const hooks = makeHooks();
    expect(typeof hooks.useWatchlist).toBe("function");
    const { result } = renderHook(() => {
      return hooks.useWatchlist();
    });
    expect(Array.isArray(result.current)).toBe(true);
  });

  it("useEquityQuote is a function", () => {
    const hooks = makeHooks();
    expect(typeof hooks.useEquityQuote).toBe("function");
  });

  it("useCandles is a function", () => {
    const hooks = makeHooks();
    expect(typeof hooks.useCandles).toBe("function");
  });

  it("useDepth is a function", () => {
    const hooks = makeHooks();
    expect(typeof hooks.useDepth).toBe("function");
  });

  it("useEquityOrders is a function and returns an array by default", () => {
    const hooks = makeHooks();
    expect(typeof hooks.useEquityOrders).toBe("function");
    const { result } = renderHook(() => {
      return hooks.useEquityOrders();
    });
    expect(Array.isArray(result.current)).toBe(true);
  });

  it("useEquityPositions is a function and returns an array by default", () => {
    const hooks = makeHooks();
    expect(typeof hooks.useEquityPositions).toBe("function");
    const { result } = renderHook(() => {
      return hooks.useEquityPositions();
    });
    expect(Array.isArray(result.current)).toBe(true);
  });

  it("useOrderTicket is a function and returns an object exposing submit", () => {
    const hooks = makeHooks();
    expect(typeof hooks.useOrderTicket).toBe("function");
    const { result } = renderHook(() => {
      return hooks.useOrderTicket("AAPL");
    });
    expect(typeof result.current.submit).toBe("function");
    expect(result.current.state).toBeDefined();
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
      ...createSimulatorPorts({ preferences: new PreferencesSimulator() }),
      connectionEvents: new ConnectionEventsSimulator(),
    };
  }
}
