import { state } from "@rx-state/core";
import { act, cleanup, renderHook } from "@testing-library/react";
import { BehaviorSubject } from "rxjs";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";

import {
  createSimulatorPorts,
  InMemorySessionStore,
} from "@rtc/client-adapters";
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

afterEach(cleanup);

describe("createViewModel — core selection", () => {
  it("exposes the host's core selection", () => {
    const { presenters, machines, commands } = createHooksInputs();
    const { selection } = createSelection();

    const vm = createViewModel(presenters, machines, commands, {
      coreSelection: selection,
    });

    const { result } = renderHook(() => {
      return vm.useCoreSelection();
    });

    expect(result.current?.current).toBe("async");
    expect(result.current?.options).toBe(selection.options);
    result.current?.select("effect");
    expect(selection.select).toHaveBeenCalledExactlyOnceWith("effect");
  });

  it("follows the host's failure stream: a reason, then null again", () => {
    const { presenters, machines, commands } = createHooksInputs();
    const { selection, failures } = createSelection();

    const vm = createViewModel(presenters, machines, commands, {
      coreSelection: selection,
    });

    const { result } = renderHook(() => {
      return vm.useCoreSelection();
    });

    expect(result.current?.failure).toBeNull();
    act(() => {
      failures.next("chunk gone");
    });
    expect(result.current?.failure).toBe("chunk gone");
    act(() => {
      failures.next(null);
    });
    expect(result.current?.failure).toBeNull();
  });

  it("reports no core selection when the host supplies none", () => {
    const { presenters, machines, commands } = createHooksInputs();

    const vm = createViewModel(presenters, machines, commands);
    const { result } = renderHook(() => {
      return vm.useCoreSelection();
    });

    expect(result.current).toBeNull();
  });
});

interface Selection {
  readonly selection: CoreSelection & { readonly select: Mock };
  readonly failures: BehaviorSubject<string | null>;
}

function createSelection(): Selection {
  const failures = new BehaviorSubject<string | null>(null);

  return {
    failures,
    selection: {
      current: "async",
      options: [{ impl: "async", label: "async/await", description: "d" }],
      select: vi.fn(),
      failure$: state(failures, null),
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
