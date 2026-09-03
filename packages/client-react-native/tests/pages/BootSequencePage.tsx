// packages/client-react-native/tests/pages/BootSequencePage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";
import type { TextStyle } from "react-native";
import { StyleSheet } from "react-native";

import type { ViewModel } from "@rtc/react-bindings";
import { ViewModelProvider } from "@rtc/react-bindings";

import { BootSequence } from "#/ui/shell/boot/BootSequence";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import type { RnTheme } from "#/ui/theme/tokens";

interface BootState {
  variant: "core" | "laser" | "docking";
  progress: number;
  done: boolean;
}

function noop(): void {
  // intentionally empty
}

function fakeViewModel(state: BootState, skip: () => void): ViewModel {
  return {
    useBootSequence: (_onDone: () => void) => {
      return { state, skip };
    },
  } as unknown as ViewModel;
}

export interface BootSequencePage {
  mount(state: BootState, skip?: () => void, theme?: RnTheme): Promise<void>;
  unmountAll(): void;
  exists(testId: string): boolean;
  awaitExists(testId: string): Promise<boolean>;
  textOf(testId: string): string;
  hasText(text: string): boolean;
  press(testId: string): Promise<void>;
  /** The flattened style of a testID's element. */
  styleOf(testId: string): TextStyle;
  /** The flattened style of the FIRST element matching a rendered text's
   * host node — for the label-level style assertion on the env badge's
   * "LIVE" text, which carries no testID of its own. */
  styleOfText(text: string): TextStyle;
}

/** The framework surface for `BootSequence.test.tsx`. */
export function bootSequencePage(): BootSequencePage {
  return {
    async mount(
      state: BootState,
      skip: () => void = noop,
      theme?: RnTheme,
    ): Promise<void> {
      await renderWithTheme(
        <ViewModelProvider viewModel={fakeViewModel(state, skip)}>
          <BootSequence onDone={noop} />
        </ViewModelProvider>,
        theme,
      );
    },
    unmountAll(): void {
      cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    async awaitExists(testId: string): Promise<boolean> {
      await screen.findByTestId(testId);
      return true;
    },
    textOf(testId: string): string {
      return String(screen.getByTestId(testId).props.children);
    },
    hasText(text: string): boolean {
      return screen.queryByText(text) != null;
    },
    async press(testId: string): Promise<void> {
      await fireEvent.press(screen.getByTestId(testId));
    },
    styleOf(testId: string): TextStyle {
      return StyleSheet.flatten(
        screen.getByTestId(testId).props.style as TextStyle,
      );
    },
    styleOfText(text: string): TextStyle {
      return StyleSheet.flatten(
        screen.getByText(text).props.style as TextStyle,
      );
    },
  };
}
