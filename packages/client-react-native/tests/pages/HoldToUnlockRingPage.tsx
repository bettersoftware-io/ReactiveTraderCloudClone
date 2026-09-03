// packages/client-react-native/tests/pages/HoldToUnlockRingPage.tsx
import { cleanup, fireEvent, screen } from "@testing-library/react-native";
import { Gesture } from "react-native-gesture-handler";
import type { SharedValue } from "react-native-reanimated";

import { HoldToUnlockRing } from "#/ui/shell/lock/HoldToUnlockRing";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { textContentOf } from "#tests/pages/support/textContent";

/**
 * A stand-in shared value, built as a plain object rather than by calling
 * `useSharedValue` here.
 *
 * These call sites used to invoke the hook directly in the test body — legal
 * only because the jest mock returned a fresh plain object and so was not
 * really a hook at all. Now that the mock is `useRef`-backed to match the real
 * hook's lifetime (T31), calling it outside a component render is an invalid
 * hook call. Nothing here needs a hook: the ring only reads `.value`.
 */
function stubProgress(value: number): SharedValue<number> {
  return { value } as SharedValue<number>;
}

export interface HoldToUnlockRingPage {
  mount(progress: number, onPress: () => void, label?: string): Promise<void>;
  unmountAll(): void;
  exists(testId: string): boolean;
  labelText(): string;
  press(): Promise<void>;
}

/** The framework surface for `HoldToUnlockRing.test.tsx`. */
export function holdToUnlockRingPage(): HoldToUnlockRingPage {
  return {
    async mount(
      progress: number,
      onPress: () => void,
      label = "HOLD TO UNLOCK",
    ): Promise<void> {
      await renderWithTheme(
        <HoldToUnlockRing
          gesture={Gesture.LongPress()}
          progress={stubProgress(progress)}
          onPress={onPress}
          label={label}
        />,
      );
    },
    unmountAll(): void {
      cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    labelText(): string {
      return textContentOf(screen.getByTestId("lock-hold-label"));
    },
    async press(): Promise<void> {
      await fireEvent.press(screen.getByTestId("lock-authenticate"));
    },
  };
}
