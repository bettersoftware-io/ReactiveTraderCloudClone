import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  createSimulatorPorts,
  InMemorySessionStore,
} from "@rtc/client-adapters";
import { createApp, createMachineFactories } from "@rtc/client-core-rxjs";
import type {
  AppCommands,
  AppPorts,
  MachineFactories,
  Presenters,
} from "@rtc/core-api";
import {
  AuthSimulator,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";

import {
  createViewModel,
  type ViewModel,
  type ViewModelShell,
} from "#/createViewModel";

describe("createViewModel — useAccountList", () => {
  it("reads the shared presenter's state and its refresh reaches it", () => {
    const vm = createViewModelFor(undefined);
    const first = renderHook(() => {
      return vm.useAccountList();
    });

    const second = renderHook(() => {
      return vm.useAccountList();
    });

    expect(first.result.current.state).toEqual(second.result.current.state);
    expect(first.result.current.state.rows).toEqual([]);
    expect(() => {
      act(() => {
        first.result.current.refresh();
      });
    }).not.toThrow();
  });
});

describe("createViewModel — useAccountAction", () => {
  it("starts idle and its intents reach the machine", () => {
    const vm = createViewModelFor(undefined);
    const { result } = renderHook(() => {
      return vm.useAccountAction("a1");
    });

    expect(result.current.state).toEqual({ phase: "idle" });

    act(() => {
      result.current.intents.startRename("Ann");
    });

    expect(result.current.state).toEqual({
      phase: "renaming",
      draft: "Ann",
      draftError: null,
    });

    act(() => {
      result.current.intents.cancel();
    });

    expect(result.current.state).toEqual({ phase: "idle" });
  });

  it("builds one machine per mount: a second row starts idle on its own", () => {
    const vm = createViewModelFor(undefined);
    const first = renderHook(() => {
      return vm.useAccountAction("a1");
    });

    act(() => {
      first.result.current.intents.requestDelete();
    });
    const second = renderHook(() => {
      return vm.useAccountAction("a2");
    });

    expect(first.result.current.state.phase).toBe("confirmingDelete");
    expect(second.result.current.state).toEqual({ phase: "idle" });
  });
});

function createViewModelFor(shell: ViewModelShell | undefined): ViewModel {
  const { presenters, machines, commands } = createHooksInputs();

  return createViewModel(presenters, machines, commands, shell);
}

interface HooksInputs {
  presenters: Presenters;
  machines: MachineFactories;
  commands: AppCommands;
}

function createHooksInputs(): HooksInputs {
  const { presenters, commands } = createApp(createSimPorts());
  return {
    presenters,
    machines: createMachineFactories(presenters),
    commands,
  };
}

function createSimPorts(): AppPorts {
  return {
    ...createSimulatorPorts({
      preferences: new PreferencesSimulator(),
      auth: new AuthSimulator({}),
      sessionStore: new InMemorySessionStore(),
    }),
    connectionEvents: new ConnectionEventsSimulator(),
    connectionIntents: { reconnect: () => {}, injectIncident: () => {} },
  };
}
