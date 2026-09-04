import { afterEach, expect, jest, test } from "@jest/globals";

import type { PillSegment } from "#/ui/SegmentedPill";
import { rnThemeTokens } from "#/ui/theme/tokens";
import { segmentedPillPage } from "#tests/pages/SegmentedPillPage";

const page = segmentedPillPage();

afterEach(() => {
  return page.unmountAll();
});

const SEGMENTS: readonly PillSegment<Key>[] = [
  { key: "a", label: "ALPHA", testID: "pill-alpha" },
  { key: "b", label: "BRAVO", testID: "pill-bravo" },
];

// Ids are given per cell, never derived here: the three call sites name their
// cells on three different schemes, all of them load-bearing for the jest and
// e2e contracts.
test("names each cell by its own testID, and the frame by the given one", async () => {
  await page.mount(SEGMENTS, "a", (): void => {}, "sheetSegment", "pill-frame");

  expect(page.exists("pill-frame")).toBeTruthy();
  expect(page.hasTextContent("pill-alpha", "ALPHA")).toBe(true);
  expect(page.hasTextContent("pill-bravo", "BRAVO")).toBe(true);
});

test("marks only the current cell selected", async () => {
  await page.mount(SEGMENTS, "b", (): void => {}, "sheetSegment");

  expect(page.selected("pill-alpha")).toBe(false);
  expect(page.selected("pill-bravo")).toBe(true);
});

test("reports the pressed cell's key", async () => {
  const onChange = jest.fn<(key: Key) => void>();
  await page.mount(SEGMENTS, "a", onChange, "sheetSegment");
  await page.press("pill-bravo");

  expect(onChange).toHaveBeenCalledWith("b");
});

// The glyph joins the label inside ONE Text node — the cells lay out as a
// column, so a second child would stack under the label rather than sit
// before it.
test("prefixes the glyph to the label in a single text node", async () => {
  await page.mount(
    [{ key: "a", label: "DARK", glyph: "☾", testID: "pill-dark" }],
    "a",
    (): void => {},
    "modePill",
  );

  expect(page.hasText("☾ DARK")).toBeTruthy();
});

test("fills the active cell with the accent", async () => {
  await page.mount(SEGMENTS, "a", (): void => {}, "sheetSegment");

  expect(page.cellStyleOf("pill-alpha").backgroundColor).toBe(
    rnThemeTokens.holo.dark.accentPrimary,
  );
  expect(page.cellStyleOf("pill-bravo").backgroundColor).toBeUndefined();
});

// The geometry is the only thing `variant` picks, and the two shapes are
// opposites: the sheet/sub-nav cells divide their row equally, the mode
// pill's take only the width their labels need (it shares a row with the
// APPEARANCE title). A variant collapsing into the other would shove that
// title off a narrow screen with every press test still green.
test.each<["subNav" | "sheetSegment"]>([["subNav"], ["sheetSegment"]])(
  "the %s variant gives every cell flex:1",
  async (variant) => {
    await page.mount(SEGMENTS, "a", (): void => {}, variant);

    expect(page.cellStyleOf("pill-alpha").flex).toBe(1);
    expect(page.cellStyleOf("pill-bravo").flex).toBe(1);
  },
);

test("the mode pill's cells stay intrinsically sized", async () => {
  await page.mount(SEGMENTS, "a", (): void => {}, "modePill");

  expect(page.cellStyleOf("pill-alpha").flex).toBeUndefined();
  expect(page.cellStyleOf("pill-alpha").paddingHorizontal).toBe(11);
});

type Key = "a" | "b";
