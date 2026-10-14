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

describe("createViewModel — useAccountAccess", () => {
  it("starts at sign-in and its intents reach the machine", () => {
    const vm = createViewModelFor(undefined);
    const { result } = renderHook(() => {
      return vm.useAccountAccess();
    });

    expect(result.state()).toEqual({ phase: "signIn" });

    result.startRegistration();

    expect(result.state().phase).toBe("register");

    result.returnToSignIn();

    expect(result.state()).toEqual({ phase: "signIn" });
  });

  it("builds one machine per mount: a second mount starts at sign-in on its own", () => {
    const vm = createViewModelFor(undefined);
    const first = renderHook(() => {
      return vm.useAccountAccess();
    });

    first.result.startRegistration();
    const second = renderHook(() => {
      return vm.useAccountAccess();
    });

    expect(first.result.state().phase).toBe("register");
    expect(second.result.state()).toEqual({ phase: "signIn" });
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
