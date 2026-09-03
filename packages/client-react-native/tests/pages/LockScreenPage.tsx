// packages/client-react-native/tests/pages/LockScreenPage.tsx
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react-native";
import type { ReactElement } from "react";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { LockScreen } from "#/ui/shell/lock/LockScreen";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

export interface LockUser {
  name: string;
  initials: string;
  role: string;
  id: string;
  email: string;
  desk: string;
  clearance: string;
}

function noop(): undefined {
  return undefined;
}

interface FakePowerSaverResult {
  isCalm: boolean;
  isFreeze: boolean;
}

// useHoldToUnlock's motion gating reads usePowerSaver().isFreeze via
// useShellMotionEnabled; every fake ViewModel below needs a stub so the hook
// doesn't throw. Motion-disabled behaviour itself is covered directly in
// useHoldToUnlock.test.tsx (mocking the sibling module), not here.
function fakePowerSaver(): FakePowerSaverResult {
  return { isCalm: false, isFreeze: false };
}

function fakeViewModel(
  locked: boolean,
  unlock: (password: string) => void,
  user: LockUser | null,
  error: string | null = null,
  unlocking = false,
): ViewModel {
  return {
    useAuth: () => {
      return {
        state: {
          status: user ? "authenticated" : "unauthenticated",
          locked,
          unlocking,
          error,
          user,
        },
        login: noop,
        unlock,
        lock: noop,
        logout: noop,
      };
    },
    usePowerSaver: fakePowerSaver,
  } as unknown as ViewModel;
}

// `rerender` replaces the whole tree (it does not reapply `renderWithTheme`'s
// initial wrapper), so every rerender needs the same
// `ThemeContext.Provider` + `ViewModelProvider` nesting spelled out
// explicitly.
function lockedTree(
  locked: boolean,
  unlock: (password: string) => void,
  user: LockUser,
  unlocking = false,
): ReactElement {
  return (
    <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
      <ViewModelProvider
        viewModel={fakeViewModel(locked, unlock, user, null, unlocking)}
      >
        <LockScreen />
      </ViewModelProvider>
    </ThemeContext.Provider>
  );
}

/** What a single-child RN `<Text>` node's `props.children` actually holds. */
type TextChildren = string | number;

export interface LockScreenPage {
  mount(
    locked: boolean,
    unlock: (password: string) => void,
    user: LockUser | null,
    error?: string | null,
  ): Promise<void>;
  /** Mounts via plain `render`, under one explicit wrapper (not
   * `renderWithTheme`'s implicit one), so a later `rerenderLocked` can
   * reapply the identical wrapper shape. */
  mountLocked(
    locked: boolean,
    unlock: (password: string) => void,
    user: LockUser,
    unlocking?: boolean,
  ): Promise<void>;
  rerenderLocked(
    locked: boolean,
    unlock: (password: string) => void,
    user: LockUser,
    unlocking?: boolean,
  ): Promise<void>;
  unmountAll(): void;
  exists(testId: string): boolean;
  textOf(testId: string): TextChildren;
  typePassword(value: string): Promise<void>;
  pressAuthenticate(): Promise<void>;
}

/** The framework surface for `LockScreen.test.tsx`. */
export function lockScreenPage(): LockScreenPage {
  let rerenderFn: ((ui: ReactElement) => Promise<void>) | null = null;

  return {
    async mount(
      locked: boolean,
      unlock: (password: string) => void,
      user: LockUser | null,
      error: string | null = null,
    ): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider
          viewModel={fakeViewModel(locked, unlock, user, error)}
        >
          <LockScreen />
        </ViewModelProvider>,
      );
    },
    async mountLocked(
      locked: boolean,
      unlock: (password: string) => void,
      user: LockUser,
      unlocking = false,
    ): Promise<void> {
      const result = await render(lockedTree(locked, unlock, user, unlocking));
      rerenderFn = result.rerender;
    },
    async rerenderLocked(
      locked: boolean,
      unlock: (password: string) => void,
      user: LockUser,
      unlocking = false,
    ): Promise<void> {
      if (!rerenderFn) {
        throw new Error("mountLocked() must be called before rerenderLocked()");
      }

      await rerenderFn(lockedTree(locked, unlock, user, unlocking));
    },
    unmountAll(): void {
      cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    textOf(testId: string): TextChildren {
      return screen.getByTestId(testId).props.children as TextChildren;
    },
    async typePassword(value: string): Promise<void> {
      await fireEvent.changeText(screen.getByTestId("lock-password"), value);
    },
    async pressAuthenticate(): Promise<void> {
      await fireEvent.press(screen.getByTestId("lock-authenticate"));
    },
  };
}
