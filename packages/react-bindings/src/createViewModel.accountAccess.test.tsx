import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  createSimulatorPorts,
  InMemorySessionStore,
} from "@rtc/client-adapters";
import { createInertRouteHistory } from "@rtc/client-adapters/testing";
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

describe("createViewModel — registrationAvailable", () => {
  it("reads true from the shell", () => {
    const vm = createViewModelFor({ registrationAvailable: true });

    expect(vm.useRegistrationAvailable()).toBe(true);
  });

  it("is false when the shell omits it", () => {
    const vm = createViewModelFor({});

    expect(vm.useRegistrationAvailable()).toBe(false);
  });

  it("is false when there is no shell", () => {
    const vm = createViewModelFor(undefined);

    expect(vm.useRegistrationAvailable()).toBe(false);
  });
});

describe("createViewModel — useRouteHistory", () => {
  it("returns the shell's routes", () => {
    const routes = createInertRouteHistory();
    const vm = createViewModelFor({ routes });

    expect(vm.useRouteHistory()).toBe(routes);
  });

  it("is null when the shell omits it", () => {
    const vm = createViewModelFor({});

    expect(vm.useRouteHistory()).toBeNull();
  });

  it("is null when there is no shell", () => {
    const vm = createViewModelFor(undefined);

    expect(vm.useRouteHistory()).toBeNull();
  });
});

describe("createViewModel — useAccountAccess", () => {
  it("starts at sign-in and its intents reach the machine", () => {
    const vm = createViewModelFor(undefined);
    const { result } = renderHook(() => {
      return vm.useAccountAccess();
    });

    expect(result.current.state).toEqual({ phase: "signIn" });

    act(() => {
      result.current.startRegistration();
    });

    expect(result.current.state.phase).toBe("register");

    act(() => {
      result.current.returnToSignIn();
    });

    expect(result.current.state).toEqual({ phase: "signIn" });
  });

  it("builds one machine per mount: a second mount starts at sign-in on its own", () => {
    const vm = createViewModelFor(undefined);
    const first = renderHook(() => {
      return vm.useAccountAccess();
    });

    act(() => {
      first.result.current.startRegistration();
    });
    const second = renderHook(() => {
      return vm.useAccountAccess();
    });

    expect(first.result.current.state.phase).toBe("register");
    expect(second.result.current.state).toEqual({ phase: "signIn" });
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
