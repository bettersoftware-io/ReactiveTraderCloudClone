// TDD — RED: written before createViewModel.ts existed in @rtc/solid-bindings.
//   pnpm --filter @rtc/solid-bindings test -- createViewModel.streams  → FAIL (module not found)
// GREEN: createViewModel.ts (part 1 — streams/commands/preferences) lands.
//
// Covers only the part-1 members (streams, commands, preference bundles, plus
// the shared-singleton state+intent bundles — session/bootGate/incident).
// Machine-backed members (useMachine bridge) and useEqWorkspace are covered
// in createViewModel.machines.test.tsx / createViewModel.eqWorkspace.firstRender.test.tsx.

import { renderHook, waitFor } from "@solidjs/testing-library";
import { BehaviorSubject, type Observable, of } from "rxjs";
import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import {
  type AnimationIntent,
  type AppPorts,
  createApp,
  createMachineFactories,
  createSimulatorPorts,
  InMemorySessionStore,
  type PanelData,
  type Presenters,
} from "@rtc/client-core";
import {
  type AuthOutcome,
  type AuthPort,
  AuthSimulator,
  CANDLE_HISTORY_TOTAL,
  type CandleTimeframe,
  ConnectionEventsSimulator,
  KNOWN_CURRENCY_PAIRS,
  PreferencesSimulator,
  type PriceTick,
  type Quote,
  type SessionUser,
} from "@rtc/domain";

import { createViewModel, type ViewModel } from "#/createViewModel";

describe("createViewModel — streams", () => {
  // The composition root seeds the blotter/price/RFQ presenters with warm
  // synchronous history (mirrors the bootGate/eqWorkspace warm-value pattern
  // documented in react-bindings createViewModel.ts), so these read real
  // seeded data on the very first read rather than the `state()` default.
  it("useTrades reads the seeded trade history", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useTrades();
    });

    expect(Array.isArray(result())).toBe(true);
    expect(result().length).toBeGreaterThan(0);
  });

  it("useConnectionStatus starts CONNECTED", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useConnectionStatus();
    });

    expect(result()).toBe("CONNECTED");
  });

  it("usePrice(pair) reads the seeded quote for that pair", () => {
    const vm = makeViewModel();
    const eurusd = KNOWN_CURRENCY_PAIRS[0];

    if (!eurusd) {
      throw new Error("KNOWN_CURRENCY_PAIRS is unexpectedly empty");
    }

    const { result } = renderHook(() => {
      return vm.usePrice(eurusd);
    });

    expect(result()?.symbol).toBe(eurusd.symbol);
  });

  it("useQuotesForRfq(rfqId) starts empty for an unknown rfqId", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useQuotesForRfq(-1);
    });

    expect(result()).toEqual([]);
  });

  it("useAllQuotes reads the seeded quotes as a Map", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useAllQuotes();
    });

    expect(result()).toBeInstanceOf(Map);
    expect(result().size).toBeGreaterThan(0);
  });

  it("useNewTradeIds starts as an empty Set", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useNewTradeIds();
    });

    expect(result().size).toBe(0);
  });

  it("useAnimationIntents(target) starts null", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useAnimationIntents("tile:EURUSD");
    });

    expect(result()).toBeNull();
  });
});

describe("createViewModel — commands", () => {
  it("useAcceptQuote returns a stable callback that resolves via firstValueFrom", async () => {
    const vm = makeViewModel();
    const { result: accept } = renderHook(() => {
      return vm.useAcceptQuote();
    });

    await expect(accept(999)).resolves.toBeUndefined();
  });

  it("useCancelRfq returns a stable callback that resolves via firstValueFrom", async () => {
    const vm = makeViewModel();
    const { result: cancel } = renderHook(() => {
      return vm.useCancelRfq();
    });

    await expect(cancel(999)).resolves.toBeUndefined();
  });

  it("useReconnect returns the composition-root reconnect command", () => {
    const vm = makeViewModel();
    const { result: reconnect } = renderHook(() => {
      return vm.useReconnect();
    });

    expect(typeof reconnect).toBe("function");
    expect(() => {
      reconnect();
    }).not.toThrow();
  });
});

describe("createViewModel — preferences", () => {
  it("useThemePreference reads mode/modePreference and cycle() advances the stored preference", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useThemePreference();
    });

    expect(result.mode()).toBe("dark");
    expect(result.modePreference()).toBe("dark");

    result.cycle();
    expect(result.modePreference()).toBe("light");
  });

  it("useThemeSkinPreference reads skin and setSkin writes it", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useThemeSkinPreference();
    });

    expect(result.skin()).toBe("holo");
    result.setSkin("classic");
    expect(result.skin()).toBe("classic");
  });

  it("useAmbientStyle reads style and setStyle writes it", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useAmbientStyle();
    });

    expect(result.style()).toBe("aurora");
    result.setStyle("rays");
    expect(result.style()).toBe("rays");
  });

  it("useAnimatedBackground reads enabled and toggle() flips it", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useAnimatedBackground();
    });

    expect(result.enabled()).toBe(true);
    result.toggle();
    expect(result.enabled()).toBe(false);
  });

  it("usePowerSaver defaults off and cycle() advances off -> calm -> freeze -> off", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.usePowerSaver();
    });

    expect(result.level()).toBe("off");
    expect(result.isCalm()).toBe(false);
    expect(result.isFreeze()).toBe(false);

    result.cycle();
    expect(result.level()).toBe("calm");
    expect(result.isCalm()).toBe(true);
    expect(result.isFreeze()).toBe(false);

    result.cycle();
    expect(result.level()).toBe("freeze");
    expect(result.isCalm()).toBe(true);
    expect(result.isFreeze()).toBe(true);

    result.cycle();
    expect(result.level()).toBe("off");
  });

  it("usePowerSaver setLevel jumps directly to freeze", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.usePowerSaver();
    });

    result.setLevel("freeze");
    expect(result.level()).toBe("freeze");
    expect(result.isFreeze()).toBe(true);
  });

  it("useForceBootAnimation defaults on and toggle() flips it", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useForceBootAnimation();
    });

    expect(result.enabled()).toBe(true);
    result.toggle();
    expect(result.enabled()).toBe(false);
  });

  it("useViewModePreference reads viewMode and setViewMode writes it", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useViewModePreference();
    });

    expect(result.viewMode()).toBe("chart");
    result.setViewMode("price");
    expect(result.viewMode()).toBe("price");
  });

  it("useCreditRfqFilterPreference reads filter and setFilter writes it", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useCreditRfqFilterPreference();
    });

    expect(result.filter()).toBe("live");
    result.setFilter("closed");
    expect(result.filter()).toBe("closed");
  });

  it("useEqWatchlistSort reads sort and cycle() advances it", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useEqWatchlistSort();
    });

    expect(result.sort()).toBe("chg");
    result.cycle();
    expect(result.sort()).toBe("price");
  });

  it("useEqBlotterView reads view and setView writes it", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useEqBlotterView();
    });

    expect(result.view()).toBe("orders");
    result.setView("positions");
    expect(result.view()).toBe("positions");
  });

  it("useThroughput reads value/loading/message and setValue echoes optimistically", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useThroughput();
    });

    expect(typeof result.value()).toBe("number");
    expect(typeof result.loading()).toBe("boolean");
    expect(result.message()).toBeNull();

    // ThroughputPresenter reflects setValue optimistically (synchronous echo
    // via its setValue$ Subject, before the debounced write fires — see
    // "reflects setValue optimistically before the write resolves" in
    // client-core's ThroughputPresenter.test.ts), so the accessor must show
    // the new value immediately after the intent.
    result.setValue(250);
    expect(result.value()).toBe(250);
  });

  it("useAuth starts unauthenticated with no user", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useAuth();
    });

    expect(result.state().status).toBe("unauthenticated");
    expect(result.state().user).toBeNull();
  });

  it("useAuth login transitions to authenticated and sets the user, then lock/unlock/logout drive the rest of the lifecycle", () => {
    const vm = makeViewModel({ authPort: createFakeAuthPort() });
    const { result } = renderHook(() => {
      return vm.useAuth();
    });

    result.login("demo", "pw");

    expect(result.state().status).toBe("authenticated");
    expect(result.state().user).toEqual(DEMO_USER);

    result.lock();
    expect(result.state().locked).toBe(true);

    result.unlock("pw");
    expect(result.state().locked).toBe(false);

    result.logout();
    expect(result.state().status).toBe("unauthenticated");
    expect(result.state().user).toBeNull();
  });

  // Mirrors react-bindings' createViewModel.bootGate.firstRender.test.tsx: on
  // a `?nosplash`/webdriver load the presenter is constructed hidden, and the
  // very FIRST read of visible() must already be false — proving the binding
  // reads the presenter's live seeded value, never a literal `true` default
  // (the one-frame-splash regression the react test pins down).
  it("useBootGate's FIRST read reports the presenter's seeded visibility (false when constructed hidden)", () => {
    const vm = makeViewModel({ bootSplashHidden: true });
    const { result } = renderHook(() => {
      return vm.useBootGate();
    });

    expect(result.visible()).toBe(false);
  });

  it("useBootGate's reboot() re-raises the splash and dismiss() lowers it", () => {
    const vm = makeViewModel({ bootSplashHidden: true });
    const { result } = renderHook(() => {
      return vm.useBootGate();
    });

    expect(result.visible()).toBe(false);
    result.reboot();
    expect(result.visible()).toBe(true);
    result.dismiss();
    expect(result.visible()).toBe(false);
  });

  it("useIncident reads active incidents plus inject/clear intents", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useIncident();
    });

    expect(result.state().active).toEqual([]);
    result.inject("errorBurst");
    expect(result.state().active).toEqual(["errorBurst"]);
    result.clear();
    expect(result.state().active).toEqual([]);
  });
});

describe("createViewModel — equities streams", () => {
  it("useWatchlist starts with the simulator's watchlist", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useWatchlist();
    });

    expect(Array.isArray(result())).toBe(true);
    expect(result().length).toBeGreaterThan(0);
  });

  it("useEquityQuote reads the seeded quote for that symbol", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useEquityQuote("AAPL");
    });

    expect(result()?.symbol).toBe("AAPL");
  });

  it("useCandles defaults to '1D' (CANDLE_HISTORY_TOTAL deepened candles) when timeframe is omitted", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useCandles("AAPL");
    });

    expect(result()).toHaveLength(CANDLE_HISTORY_TOTAL);
  });

  it("useCandles threads an explicit timeframe through — every timeframe generates CANDLE_HISTORY_TOTAL candles, at a bucket spacing distinct per timeframe", () => {
    const vm = makeViewModel();
    const { result: oneWeek } = renderHook(() => {
      return vm.useCandles("AAPL", "1W");
    });

    const { result: oneMonth } = renderHook(() => {
      return vm.useCandles("AAPL", "1M");
    });

    expect(oneWeek()).toHaveLength(CANDLE_HISTORY_TOTAL);
    expect(oneMonth()).toHaveLength(CANDLE_HISTORY_TOTAL);

    // Length alone no longer discriminates timeframes (every series is now
    // CANDLE_HISTORY_TOTAL long) — so if `tf` were silently ignored and
    // useCandles always resolved "1D", the length assertions above would
    // still pass. Bucket spacing (series[1].time - series[0].time) is
    // per-timeframe (each TF_CONFIG entry has its own bucketMs) and proves
    // the tf argument actually threaded through to the simulator.
    const oneWeekSpacing = oneWeek()[1].time - oneWeek()[0].time;
    const oneMonthSpacing = oneMonth()[1].time - oneMonth()[0].time;
    expect(oneWeekSpacing).not.toBe(oneMonthSpacing);
  });

  it("useDepth reads the seeded depth book for that symbol", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useDepth("AAPL");
    });

    expect(result()?.symbol).toBe("AAPL");
  });

  it("useEquityOrders starts empty", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useEquityOrders();
    });

    expect(result()).toEqual([]);
  });

  it("useEquityPositions starts empty", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useEquityPositions();
    });

    expect(result()).toEqual([]);
  });
});

describe("createViewModel — candle backfill", () => {
  it("loadOlderCandles forwards to presenters.candleSeries.loadOlder with the exact args", () => {
    const { vm, loadOlder } = makeViewModelWithFakeCandleSeries();

    vm.loadOlderCandles("AAPL", "1W");

    expect(loadOlder).toHaveBeenCalledWith("AAPL", "1W");
  });

  it("useCandleBackfill defaults to loadingOlder/historyExhausted both false", () => {
    const { vm } = makeViewModelWithFakeCandleSeries();
    const { result } = renderHook(() => {
      return vm.useCandleBackfill("AAPL", "1D");
    });

    expect(result()).toEqual({ loadingOlder: false, historyExhausted: false });
  });

  it("useCandleBackfill reflects the presenter's loadingOlder$/historyExhausted$ values", () => {
    const { vm, loading$, exhausted$ } = makeViewModelWithFakeCandleSeries();
    const { result } = renderHook(() => {
      return vm.useCandleBackfill("AAPL", "1D");
    });

    loading$.next(true);
    expect(result()).toEqual({ loadingOlder: true, historyExhausted: false });

    loading$.next(false);
    exhausted$.next(true);
    expect(result()).toEqual({ loadingOlder: false, historyExhausted: true });
  });
});

describe("createViewModel — admin/telemetry streams", () => {
  it("useMetrics exposes throughput/latency/errorRate as accessors over the seeded rolling windows", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useMetrics();
    });

    expect(result.throughput().length).toBeGreaterThan(0);
    expect(result.latency().length).toBeGreaterThan(0);
    expect(result.errorRate().length).toBeGreaterThan(0);
  });

  it("useTopology reads the seeded service-topology graph", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useTopology();
    });

    expect(result()).not.toBeNull();
    expect(Array.isArray(result()?.nodes)).toBe(true);
  });

  it("useJarvisUsage starts null and reads the sim port's always-empty snapshot once it lands", async () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useJarvisUsage();
    });

    await waitFor(() => {
      expect(result()).not.toBeNull();
    });
    expect(result()).toEqual({
      windowStartMs: 0,
      windowEndMs: 0,
      currentWindow: [],
      sinceBoot: [],
    });
  });

  it("useJarvisPanels starts with an empty panels list and a callable dismissPanel", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useJarvisPanels();
    });

    expect(result.panels()).toEqual([]);
    expect(typeof result.dismissPanel).toBe("function");
  });

  it("useJarvisPanels renders a panel spawned through a real showPanel turn (seeded machine state)", async () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return { jarvis: vm.useJarvis(), panels: vm.useJarvisPanels() };
    });

    result.jarvis.send("show me gbp volatility");

    // ReferenceDataSimulator.getCurrencyPairs() carries a deliberate 1s
    // artificial latency (ScriptedJarvisEngine snapshots it before
    // matching the turn's intent) — well past the default waitFor budget,
    // so this needs an explicit longer one.
    await waitFor(
      () => {
        expect(result.panels.panels().length).toBeGreaterThan(0);
      },
      { timeout: 3_000 },
    );
    expect(result.panels.panels()[0]).toMatchObject({
      panelId: "panel-scripted-1",
      title: "GBP Volatility",
      status: "live",
      vizKind: "line",
    });
  }, 8_000);

  it("useJarvisPanelData starts null for an unknown panelId", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useJarvisPanelData("no-such-panel");
    });

    expect(result()).toBeNull();
  });

  it("useJarvisPanelData resolves the live panel's data once its data$ frame lands (seeded machine state)", async () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return {
        jarvis: vm.useJarvis(),
        panels: vm.useJarvisPanels(),
        panelData: vm.useJarvisPanelData("panel-scripted-1"),
      };
    });

    result.jarvis.send("show me gbp volatility");

    // Same 1s ReferenceDataSimulator latency called out on the
    // useJarvisPanels turn above — carried through to the panel's own
    // data$ frame.
    await waitFor(
      () => {
        expect(result.panels.panels().length).toBeGreaterThan(0);
      },
      { timeout: 3_000 },
    );

    await waitFor(
      () => {
        expect(result.panelData()).not.toBeNull();
      },
      { timeout: 3_000 },
    );
    expect(result.panelData()).toMatchObject({ kind: "line" });
  }, 8_000);

  it("useDockedPanelIds reads the presenter's per-tab docked-id stream", () => {
    const { presenters, commands } = createApp(createSimPorts({}));
    const fakePresenters: Presenters = {
      ...presenters,
      dockedPanelIdsFor: () => {
        return of(["panel-x"]);
      },
    };

    const vm = createViewModel(
      fakePresenters,
      createMachineFactories(fakePresenters),
      commands,
    );

    const { result } = renderHook(() => {
      return vm.useDockedPanelIds("fx");
    });

    expect(result()).toEqual(["panel-x"]);
  });

  it("useDockedPanelIds defaults to an empty array before the presenter emits", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useDockedPanelIds("fx");
    });

    expect(result()).toEqual([]);
  });

  it("useWorkspaceLayoutResets reads the presenter's reset counter", () => {
    const { presenters, commands } = createApp(createSimPorts({}));
    const fakePresenters: Presenters = {
      ...presenters,
      workspaceLayoutResets$: of(2),
    };

    const vm = createViewModel(
      fakePresenters,
      createMachineFactories(fakePresenters),
      commands,
    );

    const { result } = renderHook(() => {
      return vm.useWorkspaceLayoutResets();
    });

    expect(result()).toBe(2);
  });

  it("useWorkspaceLayoutResets defaults to 0", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useWorkspaceLayoutResets();
    });

    expect(result()).toBe(0);
  });

  it("useEventLog reads the seeded rolling event log", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useEventLog();
    });

    expect(Array.isArray(result())).toBe(true);
    expect(result().length).toBeGreaterThan(0);
  });

  it("useSessions is an array of active trader sessions", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useSessions();
    });

    expect(Array.isArray(result())).toBe(true);
  });

  it("useSessionCountSeries accumulates a sample once the sessions port emits", async () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useSessionCountSeries();
    });

    await waitFor(() => {
      expect(result().length).toBeGreaterThan(0);
    });
    expect(result().at(-1)?.value).toBeGreaterThanOrEqual(0);
  });
});

// The nine pure-subscription hooks take each key as `T | Accessor<T>`. The
// value form is covered by every test above; these pin the ADDITIVE half —
// an accessor key is read live and the subscription follows it. The seam's
// own resubscribe/release mechanics are covered in toSignal.keyed.test.tsx.
describe("createViewModel — accessor keys", () => {
  it("usePrice(accessor) reads the seeded quote for the initial pair", () => {
    const vm = makeViewModel();
    const [eurusd, gbpusd] = KNOWN_CURRENCY_PAIRS;

    if (!eurusd || !gbpusd) {
      throw new Error("KNOWN_CURRENCY_PAIRS is unexpectedly short");
    }

    const [pair] = createSignal(eurusd);
    const { result } = renderHook(() => {
      return vm.usePrice(pair);
    });

    expect(result()?.symbol).toBe(eurusd.symbol);
  });

  it("usePrice(accessor) follows the key to the other pair's stream", () => {
    const vm = makeViewModel();
    const [eurusd, gbpusd] = KNOWN_CURRENCY_PAIRS;

    if (!eurusd || !gbpusd) {
      throw new Error("KNOWN_CURRENCY_PAIRS is unexpectedly short");
    }

    const [pair, setPair] = createSignal(eurusd);
    const { result } = renderHook(() => {
      return vm.usePrice(pair);
    });

    setPair(gbpusd);

    expect(result()?.symbol).toBe(gbpusd.symbol);
  });

  it("useEquityQuote(accessor) follows the key to the other symbol's quote", () => {
    const vm = makeViewModel();
    const [symbol, setSymbol] = createSignal("AAPL");
    const { result } = renderHook(() => {
      return vm.useEquityQuote(symbol);
    });

    expect(result()?.symbol).toBe("AAPL");
    setSymbol("MSFT");

    expect(result()?.symbol).toBe("MSFT");
  });

  it("useDepth(accessor) follows the key to the other symbol's book", () => {
    const vm = makeViewModel();
    const [symbol, setSymbol] = createSignal("AAPL");
    const { result } = renderHook(() => {
      return vm.useDepth(symbol);
    });

    expect(result()?.symbol).toBe("AAPL");
    setSymbol("MSFT");

    expect(result()?.symbol).toBe("MSFT");
  });

  // Each key is independently a MaybeAccessor, so the two mixed forms below
  // must both type-check AND resubscribe on their own key alone.
  it("useCandles(accessor, literal) threads the literal timeframe and follows the symbol", () => {
    const vm = makeViewModel();
    const [symbol, setSymbol] = createSignal("AAPL");
    const { result } = renderHook(() => {
      return vm.useCandles(symbol, "1W");
    });

    expect(result()).toHaveLength(CANDLE_HISTORY_TOTAL);
    const appleSpacing = result()[1].time - result()[0].time;
    setSymbol("MSFT");

    expect(result()).toHaveLength(CANDLE_HISTORY_TOTAL);
    // Still "1W" after the symbol change — the literal key is untracked and
    // must not be lost when the accessor key re-runs the source.
    expect(result()[1].time - result()[0].time).toBe(appleSpacing);
  });

  it("useCandles(literal, accessor) follows the timeframe alone", () => {
    const vm = makeViewModel();
    const [timeframe, setTimeframe] = createSignal<CandleTimeframe>("1W");
    const { result } = renderHook(() => {
      return vm.useCandles("AAPL", timeframe);
    });

    const weekSpacing = result()[1].time - result()[0].time;
    setTimeframe("1M");

    expect(result()[1].time - result()[0].time).not.toBe(weekSpacing);
  });

  // The four hooks below back 7 of the 13 converted call sites, so they get
  // keys whose two values DIFFER OBSERVABLY — an assertion that reads the same
  // empty/default on both sides of the key change would pass against a hook
  // that never called the accessor at all.
  it("useQuotesForRfq(accessor) follows the key to the other rfqId's quotes", () => {
    const world = makeViewModelWithKeyedFakes();
    const [rfqId, setRfqId] = createSignal(1);
    const { result } = renderHook(() => {
      return world.vm.useQuotesForRfq(rfqId);
    });

    expect(quoteIds(result())).toEqual([11]);
    setRfqId(2);

    expect(quoteIds(result())).toEqual([22]);
  });

  it("useQuotesForRfq(accessor) releases the old rfqId — a later push there is ignored", () => {
    const world = makeViewModelWithKeyedFakes();
    const [rfqId, setRfqId] = createSignal(1);
    const { result } = renderHook(() => {
      return world.vm.useQuotesForRfq(rfqId);
    });

    setRfqId(2);
    world.quotesFor(1).next([quoteWithId(99)]);

    expect(quoteIds(result())).toEqual([22]);
  });

  it("useAnimationIntents(accessor) follows the key to the other target's intent kind", () => {
    const world = makeViewModelWithKeyedFakes();
    const [target, setTarget] = createSignal("tile:EURUSD");
    const { result } = renderHook(() => {
      return world.vm.useAnimationIntents(target);
    });

    expect(result()?.kind).toBe("tickUp");
    setTarget("tile:GBPUSD");

    expect(result()?.kind).toBe("fill");
  });

  it("useAnimationIntents(accessor) releases the old target — a later intent there is ignored", () => {
    const world = makeViewModelWithKeyedFakes();
    const [target, setTarget] = createSignal("tile:EURUSD");
    const { result } = renderHook(() => {
      return world.vm.useAnimationIntents(target);
    });

    setTarget("tile:GBPUSD");
    world.intentFor("tile:EURUSD").next({
      target: "tile:EURUSD",
      kind: "tickDown",
    });

    expect(result()?.kind).toBe("fill");
  });

  it("useJarvisPanelData(accessor) follows the key to the other panel's body", () => {
    const world = makeViewModelWithKeyedFakes();
    const [panelId, setPanelId] = createSignal("p1");
    const { result } = renderHook(() => {
      return world.vm.useJarvisPanelData(panelId);
    });

    expect(gaugeLabel(result())).toBe("panel-one");
    setPanelId("p2");

    expect(gaugeLabel(result())).toBe("panel-two");
  });

  it("useCandleBackfill(accessor, accessor) follows BOTH keys to that series' own flags", () => {
    const world = makeViewModelWithKeyedFakes();
    const [symbol, setSymbol] = createSignal("AAPL");
    const [timeframe, setTimeframe] = createSignal<CandleTimeframe>("1D");
    const { result } = renderHook(() => {
      return world.vm.useCandleBackfill(symbol, timeframe);
    });

    // AAPL|1D loading, MSFT|1D exhausted, AAPL|1W neither (see the harness).
    expect(result()).toEqual({ loadingOlder: true, historyExhausted: false });
    setSymbol("MSFT");

    expect(result()).toEqual({ loadingOlder: false, historyExhausted: true });
    setSymbol("AAPL");
    setTimeframe("1W");

    expect(result()).toEqual({ loadingOlder: false, historyExhausted: false });
  });

  it("usePriceHistory(accessor) follows the key to the other symbol's history", () => {
    const vm = makeViewModel();
    const [eurusd, gbpusd] = KNOWN_CURRENCY_PAIRS;

    if (!eurusd || !gbpusd) {
      throw new Error("KNOWN_CURRENCY_PAIRS is unexpectedly short");
    }

    const [symbol, setSymbol] = createSignal(eurusd.symbol);
    const { result } = renderHook(() => {
      return vm.usePriceHistory(symbol);
    });

    // The simulator seeds each pair's history with its OWN symbol's ticks, so
    // this discriminates where `Array.isArray` would not.
    expect(everyTickSymbol(result())).toEqual([eurusd.symbol]);
    setSymbol(gbpusd.symbol);

    expect(everyTickSymbol(result())).toEqual([gbpusd.symbol]);
  });
});

/** Per-key subjects behind the four keyed presenters whose real simulator
 * values are indistinguishable between two keys (all empty / all null). Built
 * the same way as `makeViewModelWithFakeCandleSeries` above — a real
 * composition root with selected presenters swapped — so the ViewModel under
 * test is the real one and only its sources are controlled.
 *
 * Seeded so that EVERY key pair differs observably: quotes 1→[11] / 2→[22],
 * intents EURUSD→tickUp / GBPUSD→fill, panels p1→"panel-one" / p2→"panel-two",
 * backfill AAPL|1D→loading / MSFT|1D→exhausted / AAPL|1W→neither. */
interface KeyedFakeHarness {
  vm: ViewModel;
  quotesFor: (rfqId: number) => BehaviorSubject<readonly Quote[]>;
  intentFor: (target: string) => BehaviorSubject<AnimationIntent>;
}

function makeViewModelWithKeyedFakes(): KeyedFakeHarness {
  const { presenters, commands } = createApp(createSimPorts({}));

  const quoteSubjects = new Map<number, BehaviorSubject<readonly Quote[]>>();

  function quotesFor(rfqId: number): BehaviorSubject<readonly Quote[]> {
    let subject = quoteSubjects.get(rfqId);

    if (!subject) {
      subject = new BehaviorSubject<readonly Quote[]>([
        quoteWithId(rfqId * 11),
      ]);
      quoteSubjects.set(rfqId, subject);
    }

    return subject;
  }

  const intentSubjects = new Map<string, BehaviorSubject<AnimationIntent>>();

  function intentFor(target: string): BehaviorSubject<AnimationIntent> {
    let subject = intentSubjects.get(target);

    if (!subject) {
      subject = new BehaviorSubject<AnimationIntent>({
        target,
        // Explicit per-target seeds with a DISTINCT fallback: a two-branch
        // ternary would hand every unrecognised key (a raw accessor function,
        // say) whichever kind sits on the else-branch, and a test asserting
        // that kind would then pass against a broken seam.
        kind: SEEDED_INTENT_KINDS[target] ?? "tickDown",
      });
      intentSubjects.set(target, subject);
    }

    return subject;
  }

  function panelDataFor(panelId: string): Observable<PanelData | null> {
    return of({
      kind: "gauge",
      // Same reasoning as SEEDED_INTENT_KINDS above — an unrecognised key must
      // not collide with either seeded label.
      label: SEEDED_PANEL_LABELS[panelId] ?? "panel-unknown",
      value: "1",
      delta: "0",
      tone: "flat",
    } as PanelData);
  }

  const fakePresenters: Presenters = {
    ...presenters,
    rfqs: {
      ...presenters.rfqs,
      quotesForRfq$: quotesFor,
    } as unknown as Presenters["rfqs"],
    animationDirector: {
      ...presenters.animationDirector,
      intentsFor: intentFor,
    } as unknown as Presenters["animationDirector"],
    jarvisPanels: {
      ...presenters.jarvisPanels,
      panelData$: panelDataFor,
    } as unknown as Presenters["jarvisPanels"],
    candleSeries: {
      candles$: presenters.candleSeries.candles$.bind(presenters.candleSeries),
      loadOlder: () => {},
      loadingOlder$: (symbol: string, timeframe?: CandleTimeframe) => {
        return of(symbol === "AAPL" && timeframe === "1D");
      },
      historyExhausted$: (symbol: string, timeframe?: CandleTimeframe) => {
        return of(symbol === "MSFT" && timeframe === "1D");
      },
    } as unknown as Presenters["candleSeries"],
  };

  return {
    vm: createViewModel(
      fakePresenters,
      createMachineFactories(fakePresenters),
      commands,
    ),
    quotesFor,
    intentFor,
  };
}

const SEEDED_INTENT_KINDS: Readonly<Record<string, AnimationIntent["kind"]>> = {
  "tile:EURUSD": "tickUp",
  "tile:GBPUSD": "fill",
};

const SEEDED_PANEL_LABELS: Readonly<Record<string, string>> = {
  p1: "panel-one",
  p2: "panel-two",
};

function quoteWithId(id: number): Quote {
  return { id, rfqId: 0, dealerId: 0, state: { type: "pendingWithoutPrice" } };
}

function quoteIds(quotes: readonly Quote[]): readonly number[] {
  return quotes.map((quote) => {
    return quote.id;
  });
}

function gaugeLabel(data: PanelData | null): string | null {
  return data?.kind === "gauge" ? data.label : null;
}

/** The distinct symbols present in a price history — `[sym]` for a seeded
 * series, `[]` for an empty one. */
function everyTickSymbol(history: readonly PriceTick[]): readonly string[] {
  return [
    ...new Set(
      history.map((tick) => {
        return tick.symbol;
      }),
    ),
  ];
}

interface MakeViewModelOptions {
  /** Seed the boot gate hidden (the `?nosplash`/webdriver decision), like
   * react-bindings' bootGate first-render regression fixture. */
  bootSplashHidden?: boolean;
  /** Override the AuthPort — used by the useAuth login-transition test to
   * inject a deterministic fake instead of the real AuthSimulator. */
  authPort?: AuthPort;
}

function makeViewModel(options: MakeViewModelOptions = {}): ViewModel {
  const { presenters, commands } = createApp(createSimPorts(options));

  return createViewModel(
    presenters,
    createMachineFactories(presenters),
    commands,
  );
}

interface FakeCandleSeriesHarness {
  vm: ViewModel;
  loadOlder: ReturnType<typeof vi.fn>;
  loading$: BehaviorSubject<boolean>;
  exhausted$: BehaviorSubject<boolean>;
}

/** Builds a real composition root (same simulator world as makeViewModel)
 * but swaps in a fake candleSeries presenter — a spy for loadOlder plus
 * caller-driven BehaviorSubjects for loadingOlder$/historyExhausted$ — so
 * the backfill flag tests aren't at the mercy of the simulator's synchronous
 * candleHistory() resolving before the assertion runs. */
function makeViewModelWithFakeCandleSeries(): FakeCandleSeriesHarness {
  const { presenters, commands } = createApp(createSimPorts({}));
  const loadOlder = vi.fn();
  const loading$ = new BehaviorSubject(false);
  const exhausted$ = new BehaviorSubject(false);

  const fakePresenters: Presenters = {
    ...presenters,
    candleSeries: {
      candles$: presenters.candleSeries.candles$.bind(presenters.candleSeries),
      loadOlder,
      loadingOlder$: () => {
        return loading$;
      },
      historyExhausted$: () => {
        return exhausted$;
      },
    } as unknown as Presenters["candleSeries"],
  };

  const vm = createViewModel(
    fakePresenters,
    createMachineFactories(fakePresenters),
    commands,
  );

  return { vm, loadOlder, loading$, exhausted$ };
}

function createSimPorts(options: MakeViewModelOptions): AppPorts {
  return {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator(),
      auth: options.authPort ?? new AuthSimulator({}),
      sessionStore: new InMemorySessionStore(),
    }),
    connectionEvents: new ConnectionEventsSimulator(),
    ...(options.bootSplashHidden
      ? {
          bootSplash: {
            shouldPlay: (): boolean => {
              return false;
            },
          },
        }
      : {}),
  };
}

const DEMO_USER: SessionUser = {
  name: "Demo Trader",
  initials: "DT",
  role: "Trader",
  id: "demo-1",
  email: "demo@example.com",
  desk: "FX",
  clearance: "standard",
};

/** Deterministic fake AuthPort — resolves synchronously so `login`'s effect
 * lands within the same render tick (mirrors `of(...)`'s synchronous
 * emission), matching react-bindings' authHooks.test.tsx fixture. */
function createFakeAuthPort(): AuthPort {
  return {
    login(username: string, password: string): Observable<AuthOutcome> {
      if (username === "demo" && password === "pw") {
        return of({ ok: true, token: "t", user: DEMO_USER, exp: 9_000_000 });
      }

      return of({ ok: false, reason: "invalid" });
    },
  };
}
