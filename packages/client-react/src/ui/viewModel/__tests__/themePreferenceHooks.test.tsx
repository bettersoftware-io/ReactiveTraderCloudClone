import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  type AppPorts,
  createApp,
  createMachineFactories,
  createSimulatorPorts,
} from "@rtc/client-core";
import { ConnectionEventsSimulator, PreferencesSimulator } from "@rtc/domain";

import { createViewModel, type ViewModel } from "../createViewModel";

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

  it("useAnimatedBackground defaults off and toggles on", () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.useAnimatedBackground();
    });
    expect(result.current.enabled).toBe(false);
    act(() => {
      result.current.toggle();
    });
    expect(result.current.enabled).toBe(true);
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
      ...createSimulatorPorts({ preferences: new PreferencesSimulator() }),
      connectionEvents: new ConnectionEventsSimulator(),
    };
  }
}
