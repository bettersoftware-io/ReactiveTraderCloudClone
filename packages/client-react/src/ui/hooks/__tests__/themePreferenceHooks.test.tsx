import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PreferencesSimulator } from "@rtc/domain";

import {
  type AppPorts,
  createApp,
  createMachineFactories,
} from "#/app/composition";

import { type AppHooks, createAppHooks } from "../createAppHooks";

function makeHooks(): AppHooks {
  const { presenters, commands } = createApp({
    ...createSimPorts(),
  });
  return createAppHooks(
    presenters,
    createMachineFactories(presenters),
    commands,
  );

  function createSimPorts(): AppPorts {
    // Reuse the default sim ports but swap preferences for an in-memory sim
    // so the test is isolated from real localStorage.
    const base = createApp().ports;
    return { ...base, preferences: new PreferencesSimulator() };
  }
}

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
