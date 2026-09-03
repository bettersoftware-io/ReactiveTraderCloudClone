// packages/client-react-native/tests/pages/LoginScreenPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { LoginScreen } from "#/ui/shell/auth/LoginScreen";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

type LoginStatus = "unauthenticated" | "authenticating" | "authenticated";

interface LoginScreenMountOptions {
  error?: string | null;
  onToggleSimulator?: (v: boolean) => void;
}

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

function fakeViewModel(
  status: LoginStatus,
  login: (username: string, password: string) => void,
  error: string | null = null,
): ViewModel {
  return {
    useAuth: () => {
      return {
        state: { status, locked: false, error, user: null },
        login,
        unlock: noop,
        lock: noop,
        logout: noop,
      };
    },
    usePowerSaver: fakePowerSaver,
  } as unknown as ViewModel;
}

export interface LoginScreenPage {
  mount(
    status: LoginStatus,
    login: (username: string, password: string) => void,
    options?: LoginScreenMountOptions,
  ): Promise<void>;
  unmountAll(): void;
  exists(testId: string): boolean;
  errorText(): unknown;
  typeUsername(value: string): Promise<void>;
  typePassword(value: string): Promise<void>;
  pressSubmit(): Promise<void>;
  toggleSimulator(next: boolean): Promise<void>;
}

/** The framework surface for `LoginScreen.test.tsx`. */
export function loginScreenPage(): LoginScreenPage {
  return {
    async mount(
      status: LoginStatus,
      login: (username: string, password: string) => void,
      options: LoginScreenMountOptions = {},
    ): Promise<void> {
      const { error = null, onToggleSimulator = noop } = options;
      await renderWithTheme(
        <ViewModelProvider viewModel={fakeViewModel(status, login, error)}>
          <LoginScreen
            simulator={false}
            onToggleSimulator={onToggleSimulator}
          />
        </ViewModelProvider>,
      );
    },
    unmountAll(): void {
      cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    errorText(): unknown {
      return screen.getByTestId("login-error").props.children;
    },
    async typeUsername(value: string): Promise<void> {
      await fireEvent.changeText(screen.getByTestId("login-username"), value);
    },
    async typePassword(value: string): Promise<void> {
      await fireEvent.changeText(screen.getByTestId("login-password"), value);
    },
    async pressSubmit(): Promise<void> {
      await fireEvent.press(screen.getByTestId("login-submit"));
    },
    async toggleSimulator(next: boolean): Promise<void> {
      await fireEvent(
        screen.getByTestId("login-sim-toggle"),
        "valueChange",
        next,
      );
    },
  };
}
