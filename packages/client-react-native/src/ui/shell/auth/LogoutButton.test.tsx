import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { LogoutButton } from "#/ui/shell/auth/LogoutButton";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("press signs the operator out", async () => {
  const logout = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(logout)}>
      <LogoutButton />
    </ViewModelProvider>,
  );
  await fireEvent.press(screen.getByTestId("logout-button"));
  expect(logout).toHaveBeenCalledTimes(1);
});

function fakeViewModel(logout: () => void): ViewModel {
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
        lock: () => {
          return undefined;
        },
        logout,
      };
    },
  } as unknown as ViewModel;
}
