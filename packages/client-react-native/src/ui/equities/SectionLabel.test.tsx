import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import { StyleSheet, type TextStyle } from "react-native";

import { SectionLabel } from "#/ui/equities/SectionLabel";
import { FONT_JETBRAINS_MONO } from "#/ui/theme/fontFamilies";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

test("renders the caption; `spaced` adds the follow-on top margin", async () => {
  await renderWithTheme(
    <>
      <SectionLabel>ORDERS</SectionLabel>
      <SectionLabel spaced>POSITIONS</SectionLabel>
    </>,
  );
  expect(screen.getByText("ORDERS")).toHaveStyle({ marginTop: 3 });
  expect(screen.getByText("POSITIONS")).toHaveStyle({ marginTop: 12 });
});

// See BlotterHeader.test.tsx: the same pin, on the widest-tracked member of
// the `labelStyle` family.
test("keeps the 8.5pt / 2-tracked mono label recipe", async () => {
  await renderWithTheme(<SectionLabel>ORDERS</SectionLabel>);

  const style = StyleSheet.flatten(
    screen.getByText("ORDERS").props.style as TextStyle,
  );

  expect(style.fontFamily).toBe(FONT_JETBRAINS_MONO);
  expect(style.fontSize).toBe(8.5);
  expect(style.letterSpacing).toBe(2);
  expect(style.fontWeight).toBeUndefined();
});
