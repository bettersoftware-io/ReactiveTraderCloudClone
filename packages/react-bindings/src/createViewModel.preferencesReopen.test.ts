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

import { createViewModel } from "#/createViewModel";

describe("createViewModel — Preferences reopen", () => {
  it("hands over the host's one-shot signal: true once, then false", () => {
    const { presenters, machines, commands } = createHooksInputs();
    let pending = true;

    const vm = createViewModel(presenters, machines, commands, {
      takePreferencesReopen: (): boolean => {
        const reopen = pending;
        pending = false;
        return reopen;
      },
    });

    expect(vm.takePreferencesReopen?.()).toBe(true);
    expect(vm.takePreferencesReopen?.()).toBe(false);
  });

  it("never reopens when the host supplies no signal", () => {
    const { presenters, machines, commands } = createHooksInputs();

    const vm = createViewModel(presenters, machines, commands);

    expect(vm.takePreferencesReopen?.()).toBe(false);
  });
});

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
