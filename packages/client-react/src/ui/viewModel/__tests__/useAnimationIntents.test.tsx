import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PreferencesSimulator } from "@rtc/domain";

import {
  type AppPorts,
  createApp,
  createMachineFactories,
} from "#/app/composition";

import { createViewModel, type ViewModel } from "../createViewModel";

describe("useAnimationIntents", () => {
  it("starts null before any animation intent fires for the target", () => {
    const hooks = makeHooks();
    const { result } = renderHook(() => {
      return hooks.useAnimationIntents("tile:EURUSD");
    });
    expect(result.current).toBeNull();
  });
});

function makeHooks(): ViewModel {
  const { presenters, commands } = createApp({
    ...createSimPorts(),
  });
  return createViewModel(
    presenters,
    createMachineFactories(presenters),
    commands,
  );

  function createSimPorts(): AppPorts {
    const base = createApp().ports;
    return { ...base, preferences: new PreferencesSimulator() };
  }
}
