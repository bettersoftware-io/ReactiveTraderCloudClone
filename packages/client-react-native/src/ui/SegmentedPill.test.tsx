import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import { StyleSheet, type ViewStyle } from "react-native";

import { type PillSegment, SegmentedPill } from "#/ui/SegmentedPill";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { rnThemeTokens } from "#/ui/theme/tokens";

const SEGMENTS: readonly PillSegment<Key>[] = [
  { key: "a", label: "ALPHA", testID: "pill-alpha" },
  { key: "b", label: "BRAVO", testID: "pill-bravo" },
];

// Ids are given per cell, never derived here: the three call sites name their
// cells on three different schemes, all of them load-bearing for the jest and
// e2e contracts.
test("names each cell by its own testID, and the frame by the given one", async () => {
  await renderWithTheme(
    <SegmentedPill
      segments={SEGMENTS}
      value="a"
      onChange={(): void => {}}
      variant="sheetSegment"
      frameTestID="pill-frame"
    />,
  );

  expect(screen.getByTestId("pill-frame")).toBeTruthy();
  expect(screen.getByTestId("pill-alpha")).toHaveTextContent("ALPHA");
  expect(screen.getByTestId("pill-bravo")).toHaveTextContent("BRAVO");
});

test("marks only the current cell selected", async () => {
  await renderWithTheme(
    <SegmentedPill
      segments={SEGMENTS}
      value="b"
      onChange={(): void => {}}
      variant="sheetSegment"
    />,
  );

  expect(selected("pill-alpha")).toBe(false);
  expect(selected("pill-bravo")).toBe(true);
});

test("reports the pressed cell's key", async () => {
  const onChange = jest.fn<(key: Key) => void>();
  await renderWithTheme(
    <SegmentedPill
      segments={SEGMENTS}
      value="a"
      onChange={onChange}
      variant="sheetSegment"
    />,
  );
  await fireEvent.press(screen.getByTestId("pill-bravo"));

  expect(onChange).toHaveBeenCalledWith("b");
});

// The glyph joins the label inside ONE Text node — the cells lay out as a
// column, so a second child would stack under the label rather than sit
// before it.
test("prefixes the glyph to the label in a single text node", async () => {
  await renderWithTheme(
    <SegmentedPill
      segments={[{ key: "a", label: "DARK", glyph: "☾", testID: "pill-dark" }]}
      value="a"
      onChange={(): void => {}}
      variant="modePill"
    />,
  );

  expect(screen.getByText("☾ DARK")).toBeTruthy();
});

test("fills the active cell with the accent", async () => {
  await renderWithTheme(
    <SegmentedPill
      segments={SEGMENTS}
      value="a"
      onChange={(): void => {}}
      variant="sheetSegment"
    />,
  );

  expect(cell("pill-alpha").backgroundColor).toBe(
    rnThemeTokens.holo.dark.accentPrimary,
  );
  expect(cell("pill-bravo").backgroundColor).toBeUndefined();
});

// The geometry is the only thing `variant` picks, and the two shapes are
// opposites: the sheet/sub-nav cells divide their row equally, the mode
// pill's take only the width their labels need (it shares a row with the
// APPEARANCE title). A variant collapsing into the other would shove that
// title off a narrow screen with every press test still green.
test.each<["subNav" | "sheetSegment"]>([["subNav"], ["sheetSegment"]])(
  "the %s variant gives every cell flex:1",
  async (variant) => {
    await renderWithTheme(
      <SegmentedPill
        segments={SEGMENTS}
        value="a"
        onChange={(): void => {}}
        variant={variant}
      />,
    );

    expect(cell("pill-alpha").flex).toBe(1);
    expect(cell("pill-bravo").flex).toBe(1);
  },
);

test("the mode pill's cells stay intrinsically sized", async () => {
  await renderWithTheme(
    <SegmentedPill
      segments={SEGMENTS}
      value="a"
      onChange={(): void => {}}
      variant="modePill"
    />,
  );

  expect(cell("pill-alpha").flex).toBeUndefined();
  expect(cell("pill-alpha").paddingHorizontal).toBe(11);
});

function cell(testId: string): ViewStyle {
  return StyleSheet.flatten(
    screen.getByTestId(testId).props.style as ViewStyle,
  );
}

function selected(testId: string): boolean {
  const state = screen.getByTestId(testId).props.accessibilityState as
    | { selected?: boolean }
    | undefined;

  return state?.selected === true;
}

type Key = "a" | "b";
