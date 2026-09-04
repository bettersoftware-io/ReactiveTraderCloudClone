import { expect, test } from "@jest/globals";

import { FONT_JETBRAINS_MONO } from "#/ui/theme/fontFamilies";
import { blotterHeaderPage } from "#tests/pages/BlotterHeaderPage";

const page = blotterHeaderPage();

test("renders all four column labels", async () => {
  await page.mount();

  expect(page.hasText("PAIR · DIR")).toBeTruthy();
  expect(page.hasText("NOTIONAL")).toBeTruthy();
  expect(page.hasText("RATE")).toBeTruthy();
  expect(page.hasText("STATUS")).toBeTruthy();
});

// Pins the column caption's typography against the `labelStyle` extraction:
// the mono-uppercase recipe (holo's plain JetBrains cut, 8pt, 1.5 tracking)
// is now assembled by a helper rather than spelled out here, and the pixels
// must not move by a hair.
test("column captions keep the 8pt / 1.5-tracked mono label recipe", async () => {
  await page.mount();

  const style = page.styleOfText("NOTIONAL");

  expect(style.fontFamily).toBe(FONT_JETBRAINS_MONO);
  expect(style.fontSize).toBe(8);
  expect(style.letterSpacing).toBe(1.5);
  expect(style.fontWeight).toBeUndefined();
});
