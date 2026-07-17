import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { LockButton } from "#/ui/shell/lock/LockButton";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("press locks the session", async () => {
  const lock = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(lock)}>
      <LockButton />
    </ViewModelProvider>,
  );
  await fireEvent.press(screen.getByTestId("lock-button"));
  expect(lock).toHaveBeenCalledTimes(1);
});

function fakeViewModel(lock: () => void): ViewModel {
  return {
    useAuth: () => {
      return {
        state: {
          status: "authenticated",
          locked: false,
          error: null,
          user: {
            name: "",
            initials: "",
            role: "",
            id: "",
            email: "",
            desk: "",
            clearance: "",
          },
        },
        login: () => {
          return undefined;
        },
        unlock: () => {
          return undefined;
        },
        lock,
        logout: () => {
          return undefined;
        },
      };
    },
  } as unknown as ViewModel;
}
