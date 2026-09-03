// packages/client-react-native/tests/pages/AppearanceOverlayPage.tsx
import { cleanup, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { AppearanceOverlay } from "#/ui/shell/appearance/AppearanceOverlay";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

function noop(): void {
  return;
}

function vm(): ViewModel {
  return {
    useThemePreference: () => {
      return { mode: "dark", modePreference: "dark", cycle: noop };
    },
    useThemeSkinPreference: () => {
      return { skin: "holo", setSkin: noop };
    },
    useAnimatedBackground: () => {
      return { enabled: false, setEnabled: noop, toggle: noop };
    },
    usePowerSaver: () => {
      return {
        level: "off",
        isCalm: false,
        isFreeze: false,
        setLevel: noop,
        cycle: noop,
      };
    },
    useAmbientStyle: () => {
      return { style: "aurora", setStyle: noop };
    },
    useBootGate: () => {
      return { visible: false, reboot: noop, dismiss: noop };
    },
    // Required since P7 put `LogoutButton` in the sheet (via `AppearanceScreen`).
    useAuth: () => {
      return { logout: noop };
    },
  } as unknown as ViewModel;
}

function wrapped(open: boolean): ReactElement {
  return (
    <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
      <ViewModelProvider viewModel={vm()}>
        <AppearanceOverlay open={open} onClose={noop} />
      </ViewModelProvider>
    </ThemeContext.Provider>
  );
}

export interface AppearanceOverlayPage {
  mount(open: boolean): Promise<void>;
  /** Mounts via plain `render`, under one explicit `ThemeContext.Provider`
   * (not `renderWithTheme`'s implicit one) so a later `rerenderOpen` can
   * reapply the identical wrapper shape. */
  mountBare(open: boolean): Promise<void>;
  rerenderOpen(open: boolean): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
}

/** The framework surface for `AppearanceOverlay.test.tsx`. */
export function appearanceOverlayPage(): AppearanceOverlayPage {
  let rerenderFn: ((ui: ReactElement) => Promise<void>) | null = null;

  return {
    async mount(open: boolean): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={vm()}>
          <AppearanceOverlay open={open} onClose={noop} />
        </ViewModelProvider>,
      );
    },
    async mountBare(open: boolean): Promise<void> {
      const result = await render(wrapped(open));
      rerenderFn = result.rerender;
    },
    async rerenderOpen(open: boolean): Promise<void> {
      if (!rerenderFn) {
        throw new Error("mountBare() must be called before rerenderOpen()");
      }

      await rerenderFn(wrapped(open));
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
  };
}
