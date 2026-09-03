// packages/client-react-native/tests/pages/LockButtonPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { LockButton } from "#/ui/shell/lock/LockButton";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

function noop(): undefined {
  return undefined;
}

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
        login: noop,
        unlock: noop,
        lock,
        logout: noop,
      };
    },
  } as unknown as ViewModel;
}

export interface LockButtonPage {
  mount(lock: () => void): Promise<void>;
  unmountAll(): void;
  press(): Promise<void>;
}

/** The framework surface for `LockButton.test.tsx`. */
export function lockButtonPage(): LockButtonPage {
  return {
    async mount(lock: () => void): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={fakeViewModel(lock)}>
          <LockButton />
        </ViewModelProvider>,
      );
    },
    unmountAll(): void {
      cleanup();
    },
    async press(): Promise<void> {
      await fireEvent.press(screen.getByTestId("lock-button"));
    },
  };
}
