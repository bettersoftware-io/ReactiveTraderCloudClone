import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import { StyleSheet, type TextStyle } from "react-native";

import { FONT_JETBRAINS_MONO } from "#/ui/theme/fontFamilies";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

import { BlotterHeader } from "./BlotterHeader";

test("renders all four column labels", async () => {
  await renderWithTheme(<BlotterHeader />);

  expect(screen.getByText("PAIR · DIR")).toBeTruthy();
  expect(screen.getByText("NOTIONAL")).toBeTruthy();
  expect(screen.getByText("RATE")).toBeTruthy();
  expect(screen.getByText("STATUS")).toBeTruthy();
});

// Pins the column caption's typography against the `labelStyle` extraction:
// the mono-uppercase recipe (holo's plain JetBrains cut, 8pt, 1.5 tracking)
// is now assembled by a helper rather than spelled out here, and the pixels
// must not move by a hair.
test("column captions keep the 8pt / 1.5-tracked mono label recipe", async () => {
  await renderWithTheme(<BlotterHeader />);

  const style = StyleSheet.flatten(
    screen.getByText("NOTIONAL").props.style as TextStyle,
  );

  expect(style.fontFamily).toBe(FONT_JETBRAINS_MONO);
  expect(style.fontSize).toBe(8);
  expect(style.letterSpacing).toBe(1.5);
  expect(style.fontWeight).toBeUndefined();
});
