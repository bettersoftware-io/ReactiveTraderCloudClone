import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { JSX } from "react";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { LockScreen } from "#/ui/shell/lock/LockScreen";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

const USER = {
  name: "Anthony Stark",
  initials: "AS",
  role: "Senior FX Trader",
  id: "TRD-0042",
  email: "a.stark@reactivetrader.io",
  desk: "G10 Spot · London",
  clearance: "LEVEL 4 · FULL",
};

test("renders nothing when the session is unlocked", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(false, noop)}>
      <LockScreen />
    </ViewModelProvider>,
  );
  expect(screen.queryByTestId("lock-screen")).toBeNull();
});

test("shows the operator identity when locked", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(true, noop)}>
      <LockScreen />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("lock-title")).toBeTruthy();
  expect(screen.getByTestId("lock-user-name").props.children).toBe(
    "Anthony Stark",
  );
  expect(screen.getByText("Senior FX Trader")).toBeTruthy();
});

test("AUTHENTICATE press calls unlock with the typed password", async () => {
  const unlock = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(true, unlock)}>
      <LockScreen />
    </ViewModelProvider>,
  );
  await fireEvent.changeText(
    screen.getByTestId("lock-password"),
    "correct-horse-battery-staple",
  );
  await fireEvent.press(screen.getByTestId("lock-authenticate"));
  expect(unlock).toHaveBeenCalledTimes(1);
  expect(unlock).toHaveBeenCalledWith("correct-horse-battery-staple");
});

test("renders the auth error when unlock fails", async () => {
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel(true, noop, "Invalid credentials")}
    >
      <LockScreen />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("lock-error").props.children).toBe(
    "Invalid credentials",
  );
});

test("renders nothing when locked but no user is present", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModelNoUser()}>
      <LockScreen />
    </ViewModelProvider>,
  );
  expect(screen.queryByTestId("lock-screen")).toBeNull();
});

test("fires the success haptic exactly once on unlock, and re-arms for a later lock", async () => {
  const Haptics = require("expo-haptics") as MockedHaptics;
  Haptics.notificationAsync.mockClear();

  const unlock = jest.fn();
  // Renders with `lockedTree`'s own single `ThemeContext.Provider` from the
  // start (not `renderWithTheme`, which would add a second, outer one) —
  // `rerender` swaps in a whole new tree rather than reapplying the initial
  // wrapper, so every render in this test must share one identical shape or
  // React sees a type mismatch at the wrapper position and remounts
  // `LockScreen` (silently resetting `wasLockedRef` — the once-guard this
  // test exists to check).
  const { rerender } = await render(lockedTree(true, unlock));
  expect(Haptics.notificationAsync).not.toHaveBeenCalled();

  await rerender(lockedTree(false, unlock));
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(
    Haptics.NotificationFeedbackType.Success,
  );

  // Re-render while still unlocked (a fresh but logically identical state) —
  // must NOT re-fire the once-guard.
  await rerender(lockedTree(false, unlock));
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);

  // Lock again, then unlock again — the guard must re-arm for the next cycle.
  await rerender(lockedTree(true, unlock));
  await rerender(lockedTree(false, unlock));
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(2);
});

// `rerender` replaces the whole tree (it does not reapply `renderWithTheme`'s
// initial wrapper), so every rerender in the haptic test above needs the
// same `ThemeContext.Provider` + `ViewModelProvider` nesting spelled out
// explicitly — matches `ExecutionCeremony.test.tsx`'s rerender pattern.
function lockedTree(
  locked: boolean,
  unlock: (password: string) => void,
): JSX.Element {
  return (
    <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
      <ViewModelProvider viewModel={fakeViewModel(locked, unlock)}>
        <LockScreen />
      </ViewModelProvider>
    </ThemeContext.Provider>
  );
}

function fakeViewModel(
  locked: boolean,
  unlock: (password: string) => void,
  error: string | null = null,
): ViewModel {
  return {
    useAuth: () => {
      return {
        state: {
          status: "authenticated",
          locked,
          error,
          user: USER,
        },
        login: () => {
          return undefined;
        },
        unlock,
        lock: () => {
          return undefined;
        },
        logout: () => {
          return undefined;
        },
      };
    },
    usePowerSaver: fakePowerSaver,
  } as unknown as ViewModel;
}

function fakeViewModelNoUser(): ViewModel {
  return {
    useAuth: () => {
      return {
        state: {
          status: "unauthenticated",
          locked: true,
          error: null,
          user: null,
        },
        login: () => {
          return undefined;
        },
        unlock: () => {
          return undefined;
        },
        lock: () => {
          return undefined;
        },
        logout: () => {
          return undefined;
        },
      };
    },
    usePowerSaver: fakePowerSaver,
  } as unknown as ViewModel;
}

interface FakePowerSaverResult {
  isCalm: boolean;
  isFreeze: boolean;
}

// useHoldToUnlock's motion gating reads usePowerSaver().isFreeze via
// useShellMotionEnabled; every fake ViewModel above needs a stub so the hook
// doesn't throw. Motion-disabled behaviour itself is covered directly in
// useHoldToUnlock.test.tsx (mocking the sibling module), not here.
function fakePowerSaver(): FakePowerSaverResult {
  return { isCalm: false, isFreeze: false };
}

function noop(): undefined {
  return undefined;
}

interface MockedHaptics {
  notificationAsync: jest.Mock;
  NotificationFeedbackType: { Success: string };
}
