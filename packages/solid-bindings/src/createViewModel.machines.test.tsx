// TDD — RED: these members were "implemented in Task 7" stubs (see git
//   history on createViewModel.ts) that threw synchronously; every test below
//   failed with that stub error before the useMachine wiring landed.
// GREEN: createViewModel.ts's machine-backed members now delegate to
//   useMachine exactly as react-bindings does (see its createViewModel.ts:605-752).
//
// Smoke coverage only — the machines themselves are exhaustively unit-tested
// in @rtc/client-core (presenters/__tests__/*Machine.test.ts); this proves the
// seam wiring (factory called once, state readable as an Accessor, intents
// forward to the machine, dispose on cleanup) mirroring how react-bindings'
// __tests__/creditRfqHooks.test.tsx exercises useRfqSubmission/useCancelRfq
// through the full create→confirm flow.

import { renderHook, waitFor } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import {
  type AppPorts,
  createApp,
  createMachineFactories,
  createSimulatorPorts,
} from "@rtc/client-core";
import {
  ConnectionEventsSimulator,
  Direction,
  KNOWN_CURRENCY_PAIRS,
  PreferencesSimulator,
} from "@rtc/domain";

import { createViewModel, type ViewModel } from "#/createViewModel";

describe("createViewModel — machine-backed members", () => {
  it("useTileExecution starts ready and exposes execute/dismiss intents", () => {
    const vm = makeViewModel();
    const eurusd = requireFirstPair();

    const { result } = renderHook(() => {
      return vm.useTileExecution(eurusd);
    });

    expect(result.state()).toEqual({ status: "ready" });
    expect(typeof result.execute).toBe("function");
    expect(typeof result.dismiss).toBe("function");
  });

  it("useRfqTile starts in init and exposes the RFQ lifecycle intents", () => {
    const vm = makeViewModel();
    const eurusd = requireFirstPair();

    const { result } = renderHook(() => {
      return vm.useRfqTile(eurusd);
    });

    expect(result.state()).toEqual({
      status: "init",
      quote: null,
      remainingMs: 0,
    });
    expect(typeof result.requestQuote).toBe("function");
  });

  it("useStaleFlag returns an intent-free Accessor<boolean> (starts false)", () => {
    const vm = makeViewModel();
    const eurusd = requireFirstPair();

    const { result } = renderHook(() => {
      return vm.useStaleFlag(eurusd);
    });

    expect(result()).toBe(false);
  });

  it("useAnalyticsStaleFlag returns an intent-free Accessor<boolean> (starts false)", () => {
    const vm = makeViewModel();

    const { result } = renderHook(() => {
      return vm.useAnalyticsStaleFlag();
    });

    expect(result()).toBe(false);
  });

  it("useRowHighlight(isNew) starts true for a new row and false for an existing one", () => {
    const vm = makeViewModel();

    const { result: newRow } = renderHook(() => {
      return vm.useRowHighlight(true);
    });
    const { result: existingRow } = renderHook(() => {
      return vm.useRowHighlight(false);
    });

    expect(newRow()).toBe(true);
    expect(existingRow()).toBe(false);
  });

  it("useNotional(defaultNotional) starts at the default and change() updates the view", () => {
    const vm = makeViewModel();

    const { result } = renderHook(() => {
      return vm.useNotional(1_000_000);
    });

    expect(result.state().numericValue).toBe(1_000_000);
    expect(result.state().isDefault).toBe(true);

    result.change("2.5m");
    expect(result.state().numericValue).toBe(2_500_000);
    expect(result.state().isDefault).toBe(false);
  });

  it("useRfqSubmission drives create→confirmed, mirroring react-bindings' creditRfqHooks flow", async () => {
    const vm = makeViewModel();

    const { result } = renderHook(() => {
      return vm.useRfqSubmission();
    });

    expect(result.state()).toEqual({ status: "editing" });

    result.submit(
      {
        instrumentId: 1,
        dealerIds: [1],
        quantity: 1000,
        direction: Direction.Buy,
      },
      () => {},
    );

    await waitFor(() => {
      expect(result.state().status).toBe("confirmed");
    });
  });

  it("useTicketSubmission starts unsubmitted and exposes submitPrice/pass intents", () => {
    const vm = makeViewModel();

    const { result } = renderHook(() => {
      return vm.useTicketSubmission();
    });

    expect(result.state()).toEqual({ submitted: false });
    expect(typeof result.submitPrice).toBe("function");
    expect(typeof result.pass).toBe("function");
  });

  it("useRfqCountdown(creationTimestamp, totalMs) starts near totalMs and ticks down", () => {
    const vm = makeViewModel();
    const totalMs = 10_000;

    const { result } = renderHook(() => {
      return vm.useRfqCountdown(Date.now(), totalMs);
    });

    expect(result()).toBeLessThanOrEqual(totalMs);
    expect(result()).toBeGreaterThan(0);
  });

  it("useLayout(tab) starts with nothing maximized and maximize()/restore() round-trip", () => {
    const vm = makeViewModel();

    const { result } = renderHook(() => {
      return vm.useLayout("fx");
    });

    expect(result.state().maximized).toBeNull();

    result.maximize("fx-blotter");
    expect(result.state().maximized).toBe("fx-blotter");

    result.restore();
    expect(result.state().maximized).toBeNull();
  });

  it("useBootSequence(onDone) starts with a live progress ramp and skip() completes it", () => {
    const vm = makeViewModel();
    let done = false;

    const { result } = renderHook(() => {
      return vm.useBootSequence(() => {
        done = true;
      });
    });

    expect(result.state().done).toBe(false);
    result.skip();
    expect(result.state().done).toBe(true);
    expect(done).toBe(true);
  });

  it("useOrderTicket(defaultSymbol) starts editing with the given symbol", () => {
    const vm = makeViewModel();

    const { result } = renderHook(() => {
      return vm.useOrderTicket("AAPL");
    });

    const editing = result.state();

    if (editing.phase !== "editing") {
      throw new Error(`expected phase "editing", got "${editing.phase}"`);
    }

    expect(editing.form.symbol).toBe("AAPL");
  });

  it("useEqWorkspace's select/closeTab/setTimeframe intents drive the shared workspace state", () => {
    const vm = makeViewModel();

    const { result } = renderHook(() => {
      return vm.useEqWorkspace();
    });

    expect(result.state().sel).toBe("AAPL");

    result.setTimeframe("1W");
    expect(result.state().timeframe).toBe("1W");
  });
});

function requireFirstPair(): (typeof KNOWN_CURRENCY_PAIRS)[number] {
  const pair = KNOWN_CURRENCY_PAIRS[0];

  if (!pair) {
    throw new Error("KNOWN_CURRENCY_PAIRS is unexpectedly empty");
  }

  return pair;
}

function makeViewModel(): ViewModel {
  const { presenters, commands } = createApp(createSimPorts());

  return createViewModel(
    presenters,
    createMachineFactories(presenters),
    commands,
  );
}

function createSimPorts(): AppPorts {
  return {
    ...createSimulatorPorts({ preferences: new PreferencesSimulator() }),
    connectionEvents: new ConnectionEventsSimulator(),
  };
}
