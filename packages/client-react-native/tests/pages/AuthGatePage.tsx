// packages/client-react-native/tests/pages/AuthGatePage.tsx
import { cleanup, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { AuthGate } from "#/ui/shell/auth/AuthGate";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

type AuthStatus = "unauthenticated" | "authenticating" | "authenticated";

function noop(): undefined {
  return undefined;
}

interface FakePowerSaverResult {
  isCalm: boolean;
  isFreeze: boolean;
}

// LoginScreen mounts LockEmblem, whose orbit gating reads
// usePowerSaver().isFreeze via useShellMotionEnabled; the fake ViewModel
// needs the same stub LockScreen.test carries.
function fakePowerSaver(): FakePowerSaverResult {
  return { isCalm: false, isFreeze: false };
}

function fakeViewModel(status: AuthStatus): ViewModel {
  return {
    useAuth: () => {
      return {
        state: { status, locked: false, error: null, user: null },
        login: noop,
        unlock: noop,
        lock: noop,
        logout: noop,
      };
    },
    usePowerSaver: fakePowerSaver,
  } as unknown as ViewModel;
}

export interface AuthGatePage {
  mount(status: AuthStatus): Promise<void>;
  unmountAll(): void;
  exists(testId: string): boolean;
}

/** The framework surface for `AuthGate.test.tsx`. */
export function authGatePage(): AuthGatePage {
  return {
    async mount(status: AuthStatus): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={fakeViewModel(status)}>
          <AuthGate simulator={false} onToggleSimulator={noop}>
            <Text testID="child-marker">child</Text>
          </AuthGate>
        </ViewModelProvider>,
      );
    },
    unmountAll(): void {
      cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
  };
}
