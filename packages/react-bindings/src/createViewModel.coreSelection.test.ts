// TDD — RED: written before ViewModelShell/useCoreSelection existed.
//   pnpm --filter @rtc/react-bindings test coreSelection  → FAIL (property missing / extra 4th arg rejected)
// GREEN: createViewModel accepts an optional ViewModelShell 4th arg and
//   exposes it back out as useCoreSelection().

import { describe, expect, it, vi } from "vitest";

import { createSimulatorPorts, InMemorySessionStore } from "@rtc/client-core";
import { createApp, createMachineFactories } from "@rtc/client-core-rxjs";
import type {
  AppCommands,
  AppPorts,
  CoreSelection,
  MachineFactories,
  Presenters,
} from "@rtc/core-api";
import {
  AuthSimulator,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";

import { createViewModel } from "#/createViewModel";

describe("createViewModel — core selection", () => {
  it("exposes the host's core selection", () => {
    const { presenters, machines, commands } = createHooksInputs();
    const selection: CoreSelection = {
      current: "async",
      options: [{ impl: "async", label: "async/await", description: "d" }],
      select: vi.fn(),
    };

    const vm = createViewModel(presenters, machines, commands, {
      coreSelection: selection,
    });

    expect(vm.useCoreSelection()).toBe(selection);
  });

  it("reports no core selection when the host supplies none", () => {
    const { presenters, machines, commands } = createHooksInputs();

    const vm = createViewModel(presenters, machines, commands);

    expect(vm.useCoreSelection()).toBeNull();
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
