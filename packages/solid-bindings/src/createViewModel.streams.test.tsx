// TDD — RED: written before createViewModel.ts existed in @rtc/solid-bindings.
//   pnpm --filter @rtc/solid-bindings test -- createViewModel.streams  → FAIL (module not found)
// GREEN: createViewModel.ts (part 1 — streams/commands/preferences) lands.
//
// Covers only the part-1 members (streams, commands, preference bundles, plus
// the shared-singleton state+intent bundles — session/bootGate/incident).
// Machine-backed members (useMachine bridge) and useEqWorkspace are covered
// in createViewModel.machines.test.tsx / createViewModel.eqWorkspace.firstRender.test.tsx.

import { renderHook, waitFor } from "@solidjs/testing-library";
import { type Observable, of } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type AppPorts,
  createApp,
  createMachineFactories,
  createSimulatorPorts,
  InMemorySessionStore,
} from "@rtc/client-core";
import {
  type AuthOutcome,
  type AuthPort,
  AuthSimulator,
  ConnectionEventsSimulator,
  KNOWN_CURRENCY_PAIRS,
  PreferencesSimulator,
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

  it("useForceBootAnimation defaults off and toggle() flips it", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useForceBootAnimation();
    });

    expect(result.enabled()).toBe(false);
    result.toggle();
    expect(result.enabled()).toBe(true);
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

  it("useCandles defaults to '1D' (60 one-minute candles) when timeframe is omitted", () => {
    const vm = makeViewModel();
    const { result } = renderHook(() => {
      return vm.useCandles("AAPL");
    });

    expect(result()).toHaveLength(60);
  });

  it("useCandles threads an explicit timeframe through to a distinct series length", () => {
    const vm = makeViewModel();
    const { result: oneWeek } = renderHook(() => {
      return vm.useCandles("AAPL", "1W");
    });

    const { result: oneMonth } = renderHook(() => {
      return vm.useCandles("AAPL", "1M");
    });

    expect(oneWeek()).toHaveLength(44);
    expect(oneMonth()).toHaveLength(48);
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
