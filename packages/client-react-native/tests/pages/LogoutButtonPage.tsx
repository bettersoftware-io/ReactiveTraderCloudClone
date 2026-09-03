// packages/client-react-native/tests/pages/LogoutButtonPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { LogoutButton } from "#/ui/shell/auth/LogoutButton";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

function noop(): undefined {
  return undefined;
}

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
        login: noop,
        unlock: noop,
        lock: noop,
        logout,
      };
    },
  } as unknown as ViewModel;
}

export interface LogoutButtonPage {
  mount(logout: () => void): Promise<void>;
  unmountAll(): void;
  press(): Promise<void>;
}

/** The framework surface for `LogoutButton.test.tsx`. */
export function logoutButtonPage(): LogoutButtonPage {
  return {
    async mount(logout: () => void): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={fakeViewModel(logout)}>
          <LogoutButton />
        </ViewModelProvider>,
      );
    },
    unmountAll(): void {
      cleanup();
    },
    async press(): Promise<void> {
      await fireEvent.press(screen.getByTestId("logout-button"));
    },
  };
}
