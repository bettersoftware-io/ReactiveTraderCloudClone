import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { StyleSheet, type TextStyle, type ViewStyle } from "react-native";

import { ThemeModePill } from "#/ui/shell/appearance/ThemeModePill";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { rnThemeTokens } from "#/ui/theme/tokens";

// THREE cells, not the design's two: `system` is this app's own preference,
// and a regression to a 2-way pill would leave it unreachable from the sheet
// with every press test below still green.
test("renders all three mode cells with the design's glyph labels", async () => {
  await renderWithTheme(
    <ThemeModePill value="dark" onSelect={(): void => {}} />,
  );
  expect(screen.getByText("☾ DARK")).toBeTruthy();
  expect(screen.getByText("☀ LIGHT")).toBeTruthy();
  expect(screen.getByText("AUTO")).toBeTruthy();
});

test.each<["dark" | "light" | "system"]>([["dark"], ["light"], ["system"]])(
  "pressing the %s cell reports that cell",
  async (target) => {
    const onSelect = jest.fn();
    await renderWithTheme(<ThemeModePill value="dark" onSelect={onSelect} />);
    await fireEvent.press(screen.getByTestId(`appearance-mode-${target}`));
    expect(onSelect).toHaveBeenCalledWith(target);
  },
);

// The pill reports every press, including one on the already-active cell —
// the cycle arithmetic that turns "already there" into zero steps lives in
// `cyclesToReach`, not here, so swallowing it would hide that seam.
test("pressing the active cell still reports it", async () => {
  const onSelect = jest.fn();
  await renderWithTheme(<ThemeModePill value="light" onSelect={onSelect} />);
  await fireEvent.press(screen.getByTestId("appearance-mode-light"));
  expect(onSelect).toHaveBeenCalledWith("light");
});

test("the active cell is filled with the accent and lettered on-accent", async () => {
  const t = rnThemeTokens.holo.dark;
  await renderWithTheme(
    <ThemeModePill value="light" onSelect={(): void => {}} />,
  );
  const active = StyleSheet.flatten(
    screen.getByTestId("appearance-mode-light").props.style as ViewStyle,
  );
  expect(active.backgroundColor).toBe(t.accentPrimary);
  expect(
    StyleSheet.flatten(screen.getByText("☀ LIGHT").props.style as TextStyle)
      .color,
  ).toBe(t.textOnAccent);

  const idle = StyleSheet.flatten(
    screen.getByTestId("appearance-mode-dark").props.style as ViewStyle,
  );
  expect(idle.backgroundColor).toBeUndefined();
  expect(
    StyleSheet.flatten(screen.getByText("☾ DARK").props.style as TextStyle)
      .color,
  ).toBe(t.textSecondary);
});

// The pill shares the header row with the APPEARANCE title, so `flex: 1`
// cells (the safe-by-construction answer for a full-width segment) would be
// exactly wrong here: they would stretch the pill across the row and shove
// the title out. Intrinsic cells are the invariant, and the title's own
// `flexShrink: 1` (asserted in AppearanceScreen.test.tsx) is what absorbs a
// narrow screen.
test("cells are intrinsically sized, never flex:1", async () => {
  await renderWithTheme(
    <ThemeModePill value="dark" onSelect={(): void => {}} />,
  );

  for (const target of ["dark", "light", "system"]) {
    const cell = StyleSheet.flatten(
      screen.getByTestId(`appearance-mode-${target}`).props.style as ViewStyle,
    );
    expect(cell.flex).toBeUndefined();
    expect(typeof cell.paddingHorizontal).toBe("number");
  }
});

test("each cell announces its own selected state", async () => {
  await renderWithTheme(
    <ThemeModePill value="system" onSelect={(): void => {}} />,
  );

  expect(selectedState("appearance-mode-system")).toBe(true);
  expect(selectedState("appearance-mode-dark")).toBe(false);
});

function selectedState(testId: string): boolean | undefined {
  return (
    screen.getByTestId(testId).props.accessibilityState as
      | { selected?: boolean }
      | undefined
  )?.selected;
}
