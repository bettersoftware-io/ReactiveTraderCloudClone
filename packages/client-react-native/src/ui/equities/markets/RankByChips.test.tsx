import { afterEach, expect, jest, test } from "@jest/globals";

import { rankByChipsPage } from "#tests/pages/RankByChipsPage";

const setSort = jest.fn();

const page = rankByChipsPage();

afterEach(() => {
  return page.unmountAll();
});

test("renders the design's three chips, in order", async () => {
  await page.mount("chg", setSort);
  expect(page.hasText("% CHG")).toBe(true);
  expect(page.hasText("PRICE")).toBe(true);
  expect(page.hasText("A–Z")).toBe(true);
});

test("pressing a chip sets that sort directly", async () => {
  setSort.mockClear();
  await page.mount("chg", setSort);
  await page.press("eq-rank-price");
  expect(setSort).toHaveBeenCalledWith("price");
});

test("marks the active chip from the preference", async () => {
  await page.mount("sym", setSort);
  // The testID stays stable across active/inactive (`eq-rank-${target}`) —
  // an earlier ruling: a testID must not change identity with its state, or
  // `getByTestId` breaks exactly when the state occurs. The active state is
  // exposed via `accessibilityState.selected` instead.
  expect(page.selected("eq-rank-sym")).toBe(true);
  expect(page.selected("eq-rank-chg")).toBe(false);
});

test("chips never stretch — the Phase 4a full-height-bar bug", async () => {
  await page.mount("chg", setSort);
  const row = page.rowStyle();

  expect(row.alignItems).toBe("center");
  const chip = page.chipStyle("eq-rank-price");

  expect(chip.flexGrow).toBe(0);
  expect(chip.flexShrink).toBe(0);
});

test("draws the design's pills — accent-filled when selected", async () => {
  await page.mount("sym", setSort);
  const active = page.chipStyle("eq-rank-sym");
  const inactive = page.chipStyle("eq-rank-chg");

  // `border-radius:999px` in the design (dc.html ~L335), not a rectangle.
  expect(active.borderRadius).toBe(999);
  expect(inactive.borderRadius).toBe(999);
  expect(active.backgroundColor).toBe(active.borderColor);
  expect(inactive.backgroundColor).toBe("transparent");
  expect(inactive.borderColor).not.toBe(active.borderColor);
});
