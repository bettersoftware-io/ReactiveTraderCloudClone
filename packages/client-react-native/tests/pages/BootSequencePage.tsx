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

/** What a single-child RN `<Text>` node's `props.children` actually holds —
 * never coerced through `String(...)`, so a spec comparing against a
 * literal fails the way the original `expect(...props.children).toBe(str)`
 * would if the shape ever stopped being a plain string/number. */
type TextChildren = string | number;

export interface BootSequencePage {
  mount(state: BootState, skip?: () => void, theme?: RnTheme): Promise<void>;
  unmountAll(): void;
  exists(testId: string): boolean;
  awaitExists(testId: string): Promise<boolean>;
  textOf(testId: string): TextChildren;
  hasText(text: string): boolean;
  press(testId: string): Promise<void>;
  /** The flattened style of a testID's element. */
  styleOf(testId: string): TextStyle;
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
    textOf(testId: string): TextChildren {
      return screen.getByTestId(testId).props.children as TextChildren;
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
  };
}
