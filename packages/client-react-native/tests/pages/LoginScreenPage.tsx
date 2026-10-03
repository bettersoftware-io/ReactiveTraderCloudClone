// packages/client-react-native/tests/pages/LoginScreenPage.tsx
import {
  cleanup,
  fireEvent,
  screen,
  within,
} from "@testing-library/react-native";
import { type StyleProp, StyleSheet, type ViewStyle } from "react-native";

import type { LoginWaitVariant } from "@rtc/domain";
import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { LoginScreen } from "#/ui/shell/auth/LoginScreen";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

type LoginStatus = "unauthenticated" | "authenticating" | "authenticated";

interface LoginScreenMountOptions {
  error?: string | null;
  waitVariant?: LoginWaitVariant;
  onToggleSimulator?: (v: boolean) => void;
}

/** What a single-child RN `<Text>` node's `props.children` actually holds. */
type TextChildren = string | number;

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
  waitVariant: LoginWaitVariant = "handshake",
): ViewModel {
  return {
    useAuth: () => {
      return {
        state: {
          status,
          locked: false,
          unlocking: false,
          error,
          user: null,
          waitVariant,
        },
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
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  errorText(): TextChildren;
  submitLabel(): TextChildren;
  /** The flattened `opacity` of a node, `undefined` when it sets none. */
  opacityOf(testId: string): number | undefined;
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
      const {
        error = null,
        onToggleSimulator = noop,
        waitVariant = "handshake",
      } = options;
      await renderWithTheme(
        <ViewModelProvider
          viewModel={fakeViewModel(status, login, error, waitVariant)}
        >
          <LoginScreen
            simulator={false}
            onToggleSimulator={onToggleSimulator}
          />
        </ViewModelProvider>,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    errorText(): TextChildren {
      return screen.getByTestId("login-error").props.children as TextChildren;
    },
    submitLabel(): TextChildren {
      return within(screen.getByTestId("login-submit")).getByText(/AUTHENTICAT/)
        .props.children as TextChildren;
    },
    opacityOf(testId: string): number | undefined {
      return StyleSheet.flatten(
        screen.getByTestId(testId).props.style as StyleProp<ViewStyle>,
      )?.opacity as number | undefined;
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
