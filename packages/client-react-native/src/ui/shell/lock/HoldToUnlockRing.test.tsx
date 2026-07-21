import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { Gesture } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const { HoldToUnlockRing } =
  require("./HoldToUnlockRing") as typeof import("./HoldToUnlockRing");

test("renders the submit affordance under the lock-authenticate testID", async () => {
  await renderWithTheme(
    <HoldToUnlockRing
      gesture={Gesture.LongPress()}
      progress={useSharedValue(0)}
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
      progress={useSharedValue(0)}
      onPress={onPress}
    />,
  );
  await fireEvent.press(screen.getByTestId("lock-authenticate"));
  expect(onPress).toHaveBeenCalledTimes(1);
});
