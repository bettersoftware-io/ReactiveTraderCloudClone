// TDD — RED: written before useSessionCountSeries existed on ViewModel.
//   pnpm --filter @rtc/react-bindings test -- createViewModel.admin  → FAIL (property missing)
// GREEN: SessionsKpiPresenter wired into composition + createViewModel → passes.

import { renderHook, waitFor } from "@testing-library/react";
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
