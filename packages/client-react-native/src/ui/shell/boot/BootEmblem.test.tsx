import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { BootEmblem } from "#/ui/shell/boot/BootEmblem";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the emblem svg (static under reduce-motion)", async () => {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(true);
  await renderWithTheme(<BootEmblem />);
  expect(screen.getByTestId("boot-emblem")).toBeTruthy();
});
