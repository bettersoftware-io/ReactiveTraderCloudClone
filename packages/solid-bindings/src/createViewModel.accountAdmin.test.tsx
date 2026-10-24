import { renderHook } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import {
  createSimulatorPorts,
  InMemorySessionStore,
} from "@rtc/client-adapters";
import { createApp, createMachineFactories } from "@rtc/client-core-rxjs";
import type { AppPorts } from "@rtc/core-api";
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

    expect(first.result.state()).toEqual(second.result.state());
    expect(first.result.state().rows).toEqual([]);
    expect(() => {
      first.result.refresh();
    }).not.toThrow();
  });
});

describe("createViewModel — useAccountAction", () => {
  it("starts idle and its intents reach the machine", () => {
    const vm = createViewModelFor(undefined);
    const { result } = renderHook(() => {
      return vm.useAccountAction("a1");
    });

    expect(result.state()).toEqual({ phase: "idle" });

    result.intents.startRename("Ann");

    expect(result.state()).toEqual({
      phase: "renaming",
      draft: "Ann",
      draftError: null,
    });

    result.intents.cancel();

    expect(result.state()).toEqual({ phase: "idle" });
  });

  it("builds one machine per mount: a second row starts idle on its own", () => {
    const vm = createViewModelFor(undefined);
    const first = renderHook(() => {
      return vm.useAccountAction("a1");
    });

    first.result.intents.requestDelete();
    const second = renderHook(() => {
      return vm.useAccountAction("a2");
    });

    expect(first.result.state().phase).toBe("confirmingDelete");
    expect(second.result.state()).toEqual({ phase: "idle" });
  });
});

function createViewModelFor(shell: ViewModelShell | undefined): ViewModel {
  const { presenters, commands } = createApp(createSimPorts());

  return createViewModel(
    presenters,
    createMachineFactories(presenters),
    commands,
    shell,
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
    connectionIntents: { reconnect: () => {}, injectIncident: () => {} },
  };
}
