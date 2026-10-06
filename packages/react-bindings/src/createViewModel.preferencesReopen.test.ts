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
  it("takes the host's own one-shot: the host's state is consumed, not a copy", () => {
    const { presenters, machines, commands } = createHooksInputs();
    const host = createOneShot();

    const vm = createViewModel(presenters, machines, commands, host);

    expect(vm.takePreferencesReopen?.()).toBe(true);
    expect(host.peekPreferencesReopen()).toBe(false);
    expect(vm.takePreferencesReopen?.()).toBe(false);
  });

  it("peeks at the host's one-shot without consuming it", () => {
    const { presenters, machines, commands } = createHooksInputs();
    const host = createOneShot();

    const vm = createViewModel(presenters, machines, commands, host);

    expect(vm.peekPreferencesReopen?.()).toBe(true);
    expect(vm.peekPreferencesReopen?.()).toBe(true);
    expect(host.takePreferencesReopen()).toBe(true);
    expect(vm.peekPreferencesReopen?.()).toBe(false);
  });

  it("never reopens when the host supplies no signal", () => {
    const { presenters, machines, commands } = createHooksInputs();

    const vm = createViewModel(presenters, machines, commands);

    expect(vm.peekPreferencesReopen?.()).toBe(false);
    expect(vm.takePreferencesReopen?.()).toBe(false);
  });
});

interface OneShot {
  takePreferencesReopen(): boolean;
  peekPreferencesReopen(): boolean;
}

/** A host's armed one-shot, as the core host builds it for the composition
 * a swap produced. */
function createOneShot(): OneShot {
  let pending = true;

  return {
    takePreferencesReopen: (): boolean => {
      const reopen = pending;
      pending = false;
      return reopen;
    },
    peekPreferencesReopen: (): boolean => {
      return pending;
    },
  };
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
