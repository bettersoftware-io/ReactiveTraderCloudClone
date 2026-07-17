import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import { Text } from "react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { AuthGate } from "#/ui/shell/auth/AuthGate";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("unauthenticated: renders LoginScreen, not the children", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel("unauthenticated")}>
      <AuthGate simulator={false} onToggleSimulator={noop}>
        <Text testID="child-marker">child</Text>
      </AuthGate>
    </ViewModelProvider>,
  );

  expect(screen.getByTestId("login-screen")).toBeTruthy();
  expect(screen.queryByTestId("child-marker")).toBeNull();
});

test("authenticating: renders LoginScreen, not the children", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel("authenticating")}>
      <AuthGate simulator={false} onToggleSimulator={noop}>
        <Text testID="child-marker">child</Text>
      </AuthGate>
    </ViewModelProvider>,
  );

  expect(screen.getByTestId("login-screen")).toBeTruthy();
  expect(screen.queryByTestId("child-marker")).toBeNull();
});

test("authenticated: renders the children, not LoginScreen", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel("authenticated")}>
      <AuthGate simulator={false} onToggleSimulator={noop}>
        <Text testID="child-marker">child</Text>
      </AuthGate>
    </ViewModelProvider>,
  );

  expect(screen.getByTestId("child-marker")).toBeTruthy();
  expect(screen.queryByTestId("login-screen")).toBeNull();
});

function noop(): undefined {
  return undefined;
}

function fakeViewModel(
  status: "unauthenticated" | "authenticating" | "authenticated",
): ViewModel {
  return {
    useAuth: () => {
      return {
        state: {
          status,
          locked: false,
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
