// packages/client-react-native/tests/pages/AppearanceScreenPage.tsx
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react-native";
import { StyleSheet, type ViewStyle } from "react-native";

import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { AppearanceScreen } from "#/ui/AppearanceScreen";
import { ThemeContext } from "#/ui/theme/ThemeContext";
import { rnThemeTokens } from "#/ui/theme/tokens";

interface AppearanceOverrides {
  modePreference?: "dark" | "light" | "system";
  ambient?: {
    enabled: boolean;
    setEnabled: (v: boolean) => void;
    toggle: () => void;
  };
  powerSaver?: {
    level: "off" | "calm" | "freeze";
    isCalm: boolean;
    isFreeze: boolean;
    setLevel: (level: "off" | "calm" | "freeze") => void;
    cycle: () => void;
  };
  ambientStyle?: {
    style: "aurora" | "rays";
    setStyle: (s: "aurora" | "rays") => void;
  };
  reboot?: () => void;
  logout?: () => void;
}

function fakeViewModel(
  cycle: () => void,
  setSkin: (s: string) => void,
  overrides: AppearanceOverrides,
): ViewModel {
  return {
    useThemePreference: () => {
      return {
        mode: "dark",
        modePreference: overrides.modePreference ?? "system",
        cycle,
      };
    },
    useThemeSkinPreference: () => {
      return { skin: "holo", setSkin };
    },
    useAnimatedBackground: () => {
      return (
        overrides.ambient ?? {
          enabled: false,
          setEnabled: () => {},
          toggle: () => {},
        }
      );
    },
    usePowerSaver: () => {
      return (
        overrides.powerSaver ?? {
          level: "off",
          isCalm: false,
          isFreeze: false,
          setLevel: () => {},
          cycle: () => {},
        }
      );
    },
    useAmbientStyle: () => {
      return overrides.ambientStyle ?? { style: "aurora", setStyle: () => {} };
    },
    useBootGate: () => {
      return {
        visible: false,
        reboot: overrides.reboot ?? (() => {}),
        dismiss: () => {},
      };
    },
    // Required since P7 moved `LogoutButton` into this screen's last section.
    // The screen itself never touches auth — the seam is here purely because
    // it now renders a child that does, which is the honest cost of the sheet
    // owning account actions.
    useAuth: () => {
      return { logout: overrides.logout ?? (() => {}) };
    },
  } as unknown as ViewModel;
}

export interface AppearanceScreenPage {
  mount(
    cycle: () => void,
    setSkin: (s: string) => void,
    overrides?: AppearanceOverrides,
    onReplayBoot?: () => void,
  ): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  hasText(text: string): boolean;
  hasTextMatching(pattern: RegExp): boolean;
  press(testId: string): Promise<void>;
  styleOf(testId: string): ViewStyle;
  styleOfText(text: string): ViewStyle;
  /** Flattened styles of every node matching `testIdOrPattern`, in RENDER
   * order — the base spec's own `getAllByTestId(...).map(n =>
   * StyleSheet.flatten(n.props.style))`. */
  stylesOf(testIdOrPattern: string | RegExp): readonly ViewStyle[];
  /** `.props.children` of every node matching `pattern`, in RENDER order —
   * the base spec's own `getAllByTestId(pattern).map(n => n.props.children)`,
   * used for the skin labels, where testIDs alone can't express ORDER. */
  labelsMatching(pattern: RegExp): readonly unknown[];
}

/** The framework surface for `AppearanceScreen.test.tsx`. */
export function appearanceScreenPage(): AppearanceScreenPage {
  return {
    async mount(
      cycle: () => void,
      setSkin: (s: string) => void,
      overrides: AppearanceOverrides = {},
      onReplayBoot?: () => void,
    ): Promise<void> {
      await render(
        <ViewModelProvider viewModel={fakeViewModel(cycle, setSkin, overrides)}>
          <ThemeContext.Provider value={rnThemeTokens.holo.dark}>
            <AppearanceScreen onReplayBoot={onReplayBoot} />
          </ThemeContext.Provider>
        </ViewModelProvider>,
      );
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    hasTextMatching(pattern: RegExp): boolean {
      return screen.queryByText(pattern) != null;
    },
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
    styleOf(testId: string): ViewStyle {
      return StyleSheet.flatten(
        screen.getByTestId(testId).props.style as ViewStyle,
      );
    },
    styleOfText(text: string): ViewStyle {
      return StyleSheet.flatten(
        screen.getByText(text).props.style as ViewStyle,
      );
    },
    stylesOf(testIdOrPattern: string | RegExp): readonly ViewStyle[] {
      return screen.getAllByTestId(testIdOrPattern).map((node) => {
        return StyleSheet.flatten(node.props.style as ViewStyle);
      });
    },
    labelsMatching(pattern: RegExp): readonly unknown[] {
      return screen.getAllByTestId(pattern).map((node) => {
        return node.props.children;
      });
    },
  };
}
