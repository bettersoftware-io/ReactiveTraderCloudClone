import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { Gesture } from "react-native-gesture-handler";
import type { SharedValue } from "react-native-reanimated";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const { HoldToUnlockRing } =
  require("./HoldToUnlockRing") as typeof import("./HoldToUnlockRing");

test("renders the submit affordance under the lock-authenticate testID", async () => {
  await renderWithTheme(
    <HoldToUnlockRing
      gesture={Gesture.LongPress()}
      progress={stubProgress(0)}
      onPress={jest.fn()}
    />,
  );
  expect(screen.getByTestId("lock-authenticate")).toBeTruthy();
});

test("a plain tap on the ring calls onPress — the non-gesture fallback", async () => {
  const onPress = jest.fn();
  await renderWithTheme(
    <HoldToUnlockRing
      gesture={Gesture.LongPress()}
      progress={stubProgress(0)}
      onPress={onPress}
    />,
  );
  await fireEvent.press(screen.getByTestId("lock-authenticate"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

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
