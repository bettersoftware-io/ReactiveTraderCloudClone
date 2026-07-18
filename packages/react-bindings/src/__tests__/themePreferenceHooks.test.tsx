import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  type AppPorts,
  createApp,
  createMachineFactories,
  createSimulatorPorts,
  InMemorySessionStore,
} from "@rtc/client-core";
import {
  AuthSimulator,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";

import { createViewModel, type ViewModel } from "#/createViewModel";

describe("theme/skin/animated-bg hooks", () => {
  it("useThemeSkinPreference reads default holo and sets terminal", () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.useThemeSkinPreference();
    });
    expect(result.current.skin).toBe("holo");
    act(() => {
      result.current.setSkin("terminal");
    });
    expect(result.current.skin).toBe("terminal");
  });

  it("useAnimatedBackground defaults on and toggles off", () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.useAnimatedBackground();
    });
    expect(result.current.enabled).toBe(true);
    act(() => {
      result.current.toggle();
    });
    expect(result.current.enabled).toBe(false);
  });

  it("usePowerSaver defaults off and cycle() advances off -> calm -> freeze -> off", () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.usePowerSaver();
    });
    expect(result.current.level).toBe("off");
    expect(result.current.isCalm).toBe(false);
    expect(result.current.isFreeze).toBe(false);

    act(() => {
      result.current.cycle();
    });
    expect(result.current.level).toBe("calm");
    expect(result.current.isCalm).toBe(true);
    expect(result.current.isFreeze).toBe(false);

    act(() => {
      result.current.cycle();
    });
    expect(result.current.level).toBe("freeze");
    expect(result.current.isCalm).toBe(true);
    expect(result.current.isFreeze).toBe(true);

    act(() => {
      result.current.cycle();
    });
    expect(result.current.level).toBe("off");
  });

  it("usePowerSaver setLevel jumps directly to freeze", () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.usePowerSaver();
    });
    act(() => {
      result.current.setLevel("freeze");
    });
    expect(result.current.level).toBe("freeze");
    expect(result.current.isFreeze).toBe(true);
  });
});

function makeHooks(): ViewModel {
  const { presenters, commands } = createApp(createSimPorts());
  return createViewModel(
    presenters,
    createMachineFactories(presenters),
    commands,
  );

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
}
