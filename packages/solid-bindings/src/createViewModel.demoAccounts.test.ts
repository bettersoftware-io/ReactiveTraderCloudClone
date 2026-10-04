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
  type DemoAccount,
  PreferencesSimulator,
} from "@rtc/domain";

import { createViewModel } from "#/createViewModel";

describe("createViewModel — demo accounts", () => {
  it("exposes the host's demo accounts", () => {
    const { presenters, machines, commands } = createHooksInputs();
    const accounts: readonly DemoAccount[] = [
      { username: "demo", password: "pw", role: "Read-Only Guest" },
    ];

    const vm = createViewModel(presenters, machines, commands, {
      demoAccounts: accounts,
    });

    expect(vm.useDemoAccounts()).toBe(accounts);
  });

  it("reports no demo accounts when the host supplies none", () => {
    const { presenters, machines, commands } = createHooksInputs();

    const vm = createViewModel(presenters, machines, commands);

    expect(vm.useDemoAccounts()).toEqual([]);
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
