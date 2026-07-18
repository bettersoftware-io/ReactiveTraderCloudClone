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

  it("useAmbientStyle reads default aurora and sets rays", () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.useAmbientStyle();
    });
    expect(result.current.style).toBe("aurora");
    act(() => {
      result.current.setStyle("rays");
    });
    expect(result.current.style).toBe("rays");
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
