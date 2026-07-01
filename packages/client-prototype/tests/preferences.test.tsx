import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, expect, test } from "vitest";

import { PreferencesProvider } from "#/shell/Preferences/PreferencesProvider";
import { usePreferences } from "#/shell/Preferences/usePreferences";

afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty("--amb-play");
});

test("defaults: animatedBg off → --amb-play paused", () => {
  renderHook(
    () => {
      return usePreferences();
    },
    { wrapper },
  );
  expect(document.documentElement.style.getPropertyValue("--amb-play")).toBe(
    "paused",
  );
});

test("toggling animatedBg flips --amb-play to running", () => {
  const { result } = renderHook(
    () => {
      return usePreferences();
    },
    { wrapper },
  );
  act(() => {
    result.current.togglePref("animatedBg");
  });
  expect(result.current.prefs.animatedBg).toBe(true);
  expect(result.current.ambPlay).toBe("running");
  expect(document.documentElement.style.getPropertyValue("--amb-play")).toBe(
    "running",
  );
});

test("reduceMotion forces paused even when animatedBg on", () => {
  const { result } = renderHook(
    () => {
      return usePreferences();
    },
    { wrapper },
  );
  act(() => {
    result.current.togglePref("animatedBg");
    result.current.togglePref("reduceMotion");
  });
  expect(result.current.ambPlay).toBe("paused");
  expect(document.documentElement.style.getPropertyValue("--amb-play")).toBe(
    "paused",
  );
});

test("setPref updates a segment value", () => {
  const { result } = renderHook(
    () => {
      return usePreferences();
    },
    { wrapper },
  );
  act(() => {
    result.current.setPref("density", "Compact");
  });
  expect(result.current.prefs.density).toBe("Compact");
});

interface WrapperProps {
  children: ReactNode;
}

function wrapper(props: WrapperProps): ReactElement {
  return <PreferencesProvider>{props.children}</PreferencesProvider>;
}
