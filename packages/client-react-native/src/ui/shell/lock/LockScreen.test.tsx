import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { DEMO_PASSWORD } from "#/app/nativeAuthConfig";
import { LockScreen } from "#/ui/shell/lock/LockScreen";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

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

test("AUTHENTICATE press calls unlock with the demo credential", async () => {
  const unlock = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(true, unlock)}>
      <LockScreen />
    </ViewModelProvider>,
  );
  await fireEvent.press(screen.getByTestId("lock-authenticate"));
  expect(unlock).toHaveBeenCalledTimes(1);
  expect(unlock).toHaveBeenCalledWith(DEMO_PASSWORD);
});

test("renders nothing when locked but no user is present", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModelNoUser()}>
      <LockScreen />
    </ViewModelProvider>,
  );
  expect(screen.queryByTestId("lock-screen")).toBeNull();
});

function fakeViewModel(
  locked: boolean,
  unlock: (password: string) => void,
): ViewModel {
  return {
    useAuth: () => {
      return {
        state: {
          status: "authenticated",
          locked,
          error: null,
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
  } as unknown as ViewModel;
}

function noop(): undefined {
  return undefined;
}
