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
  CANDLE_HISTORY_TOTAL,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";

import { createViewModel, type ViewModel } from "#/createViewModel";

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

  it("useCandles defaults to '1D' (CANDLE_HISTORY_TOTAL deepened candles) when timeframe is omitted", () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.useCandles("AAPL");
    });
    expect(result.current).toHaveLength(CANDLE_HISTORY_TOTAL);
  });

  it("useCandles threads an explicit timeframe through — every timeframe generates CANDLE_HISTORY_TOTAL candles, at a bucket spacing distinct per timeframe", () => {
    const hooks = makeHooks();
    const { result: oneWeek } = renderHook(() => {
      return hooks.useCandles("AAPL", "1W");
    });

    const { result: oneMonth } = renderHook(() => {
      return hooks.useCandles("AAPL", "1M");
    });

    const { result: threeMonths } = renderHook(() => {
      return hooks.useCandles("AAPL", "3M");
    });
    expect(oneWeek.current).toHaveLength(CANDLE_HISTORY_TOTAL);
    expect(oneMonth.current).toHaveLength(CANDLE_HISTORY_TOTAL);
    expect(threeMonths.current).toHaveLength(CANDLE_HISTORY_TOTAL);

    // Length alone no longer discriminates timeframes (every series is now
    // CANDLE_HISTORY_TOTAL long) — so if `tf` were silently ignored and
    // useCandles always resolved "1D", the length assertions above would
    // still pass. Bucket spacing (series[1].time - series[0].time) is
    // per-timeframe (each TF_CONFIG entry has its own bucketMs) and proves
    // the tf argument actually threaded through to the simulator.
    const oneWeekSpacing = oneWeek.current[1].time - oneWeek.current[0].time;
    const oneMonthSpacing = oneMonth.current[1].time - oneMonth.current[0].time;
    const threeMonthsSpacing =
      threeMonths.current[1].time - threeMonths.current[0].time;
    expect(oneWeekSpacing).not.toBe(oneMonthSpacing);
    expect(oneMonthSpacing).not.toBe(threeMonthsSpacing);
    expect(oneWeekSpacing).not.toBe(threeMonthsSpacing);
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

  it("useEqWorkspace starts selected on the first watchlist symbol with it as the sole open tab, timeframe 1D", () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.useEqWorkspace();
    });
    // The simulator's watchlist heads with AAPL (EquityMarketDataSimulator's
    // WATCHLIST) — the composition root's synchronous peek seeds eqWorkspace
    // with it, exercising the real end-to-end wiring (not a stub timeframe).
    expect(result.current.state.sel).toBe("AAPL");
    expect(result.current.state.openTabs).toEqual(["AAPL"]);
    expect(result.current.state.timeframe).toBe("1D");
  });

  it("useEqWorkspace().select opens a new tab and selects it, shared across every hook call", () => {
    const hooks = makeHooks();
    const first = renderHook(() => {
      return hooks.useEqWorkspace();
    });

    const second = renderHook(() => {
      return hooks.useEqWorkspace();
    });

    act(() => {
      first.result.current.select("MSFT");
    });

    // Both hook calls observe the same shared machine (composition-root
    // singleton), not independent per-mount instances.
    expect(first.result.current.state.sel).toBe("MSFT");
    expect(first.result.current.state.openTabs).toEqual(["AAPL", "MSFT"]);
    expect(second.result.current.state.sel).toBe("MSFT");
    expect(second.result.current.state.openTabs).toEqual(["AAPL", "MSFT"]);
  });

  it("useEqWorkspace().closeTab falls back selection to the nearest remaining tab", () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.useEqWorkspace();
    });

    act(() => {
      result.current.select("MSFT");
    });
    act(() => {
      result.current.closeTab("AAPL");
    });

    expect(result.current.state.sel).toBe("MSFT");
    expect(result.current.state.openTabs).toEqual(["MSFT"]);
  });

  it("useEqWorkspace().closeTab never empties the last remaining tab", () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.useEqWorkspace();
    });

    act(() => {
      result.current.closeTab("AAPL");
    });

    expect(result.current.state.sel).toBe("AAPL");
    expect(result.current.state.openTabs).toEqual(["AAPL"]);
  });

  it("useEqWorkspace().setTimeframe updates the shared timeframe", () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.useEqWorkspace();
    });

    act(() => {
      result.current.setTimeframe("1M");
    });

    expect(result.current.state.timeframe).toBe("1M");
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
