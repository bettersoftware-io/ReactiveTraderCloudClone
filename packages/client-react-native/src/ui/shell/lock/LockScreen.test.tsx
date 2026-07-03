import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { LockScreen } from "#/ui/shell/lock/LockScreen";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const USER = {
  name: "Anthony Stark",
  initials: "AS",
  role: "Senior FX Trader",
  id: "TRD-0042",
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

test("AUTHENTICATE press calls unlock", async () => {
  const unlock = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(true, unlock)}>
      <LockScreen />
    </ViewModelProvider>,
  );
  await fireEvent.press(screen.getByTestId("lock-authenticate"));
  expect(unlock).toHaveBeenCalledTimes(1);
});

function fakeViewModel(locked: boolean, unlock: () => void): ViewModel {
  return {
    useSession: () => {
      return {
        state: { locked, user: USER },
        lock: () => {
          return undefined;
        },
        unlock,
      };
    },
  } as unknown as ViewModel;
}

function noop(): undefined {
  return undefined;
}
