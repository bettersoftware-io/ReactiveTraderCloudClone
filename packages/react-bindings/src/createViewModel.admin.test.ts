// TDD — RED: written before useSessionCountSeries existed on ViewModel.
//   pnpm --filter @rtc/react-bindings test -- createViewModel.admin  → FAIL (property missing)
// GREEN: SessionsKpiPresenter wired into composition + createViewModel → passes.

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  type AppPorts,
  createApp,
  createMachineFactories,
  createSimulatorPorts,
  InMemorySessionStore,
  SessionsKpiPresenter,
} from "@rtc/client-core";
import {
  AuthSimulator,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";

import { createViewModel, type ViewModel } from "#/createViewModel";

describe("createViewModel — admin hooks", () => {
  it("wires a SessionsKpiPresenter into the composition root", () => {
    const { presenters } = createApp(createSimPorts());
    expect(presenters.sessionsKpi).toBeInstanceOf(SessionsKpiPresenter);
  });

  it("useSessionCountSeries is a function and starts with an empty array", () => {
    const hooks = makeHooks();
    expect(typeof hooks.useSessionCountSeries).toBe("function");
    const { result } = renderHook(() => {
      return hooks.useSessionCountSeries();
    });
    expect(Array.isArray(result.current)).toBe(true);
  });

  it("accumulates a session-count sample once the sessions port emits", async () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.useSessionCountSeries();
    });

    await waitFor(() => {
      expect(result.current.length).toBeGreaterThan(0);
    });
    expect(result.current.at(-1)?.value).toBeGreaterThanOrEqual(0);
  });

  it("useJarvisUsage reads the sim port's always-empty snapshot", async () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.useJarvisUsage();
    });

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    expect(result.current).toEqual({
      windowStartMs: 0,
      windowEndMs: 0,
      currentWindow: [],
      sinceBoot: [],
    });
  });

  it("useJarvisPanels starts with an empty panels list and a callable dismissPanel", () => {
    const hooks = makeHooks();
    expect(typeof hooks.useJarvisPanels).toBe("function");
    const { result } = renderHook(() => {
      return hooks.useJarvisPanels();
    });
    expect(result.current.panels).toEqual([]);
    expect(typeof result.current.dismissPanel).toBe("function");
  });

  it("useJarvisPanels renders a panel spawned through a real showPanel turn (seeded machine state)", async () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return { jarvis: hooks.useJarvis(), panels: hooks.useJarvisPanels() };
    });

    act(() => {
      result.current.jarvis.send("show me gbp volatility");
    });

    // ReferenceDataSimulator.getCurrencyPairs() carries a deliberate 1s
    // artificial latency (ScriptedJarvisEngine snapshots it before
    // matching the turn's intent) — well past testing-library's default
    // 1000ms waitFor budget, so this needs an explicit longer one.
    await waitFor(
      () => {
        expect(result.current.panels.panels.length).toBeGreaterThan(0);
      },
      { timeout: 3_000 },
    );
    expect(result.current.panels.panels[0]).toMatchObject({
      panelId: "panel-scripted-1",
      title: "GBP Volatility",
      status: "live",
      vizKind: "line",
    });
  }, 8_000);
});

function makeHooks(): ViewModel {
  const { presenters, commands } = createApp(createSimPorts());
  return createViewModel(
    presenters,
    createMachineFactories(presenters),
    commands,
  );
}

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
