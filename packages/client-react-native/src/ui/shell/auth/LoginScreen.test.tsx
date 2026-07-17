import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { LoginScreen } from "#/ui/shell/auth/LoginScreen";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("typing credentials then pressing AUTHENTICATE calls login with them", async () => {
  const login = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel("unauthenticated", login)}>
      <LoginScreen />
    </ViewModelProvider>,
  );

  await fireEvent.changeText(screen.getByTestId("login-username"), "trader1");
  await fireEvent.changeText(screen.getByTestId("login-password"), "s3cret");
  await fireEvent.press(screen.getByTestId("login-submit"));

  expect(login).toHaveBeenCalledTimes(1);
  expect(login).toHaveBeenCalledWith("trader1", "s3cret");
});

test("renders the seeded error message", async () => {
  await renderWithTheme(
    <ViewModelProvider
      viewModel={fakeViewModel("unauthenticated", noop, "Invalid credentials")}
    >
      <LoginScreen />
    </ViewModelProvider>,
  );

  expect(screen.getByTestId("login-error").props.children).toBe(
    "Invalid credentials",
  );
});

test("renders no error node when state.error is null", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel("unauthenticated", noop)}>
      <LoginScreen />
    </ViewModelProvider>,
  );

  expect(screen.queryByTestId("login-error")).toBeNull();
});

test("submit is disabled while authenticating, and pressing it does not call login", async () => {
  const login = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel("authenticating", login)}>
      <LoginScreen />
    </ViewModelProvider>,
  );

  const submit = screen.getByTestId("login-submit");
  await fireEvent.press(submit);
  expect(login).not.toHaveBeenCalled();
});

function fakeViewModel(
  status: "unauthenticated" | "authenticating" | "authenticated",
  login: (username: string, password: string) => void,
  error: string | null = null,
): ViewModel {
  return {
    useAuth: () => {
      return {
        state: {
          status,
          locked: false,
          error,
          user: null,
        },
        login,
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
