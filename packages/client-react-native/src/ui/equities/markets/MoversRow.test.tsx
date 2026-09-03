import { afterEach, expect, jest, test } from "@jest/globals";

import { rnThemeTokens } from "#/ui/theme/tokens";
import { moversRowPage } from "#tests/pages/MoversRowPage";

const ROW = {
  symbol: "TSLA",
  name: "Tesla Inc",
  last: 248.67,
  changePct: 1.13,
};

const page = moversRowPage();

afterEach(() => {
  return page.unmountAll();
});

test("renders a zero-padded rank, symbol, name, price and signed pct", async () => {
  await page.mount(ROW, 1, (): void => {});
  expect(page.hasText("01")).toBe(true);
  expect(page.hasText("TSLA")).toBe(true);
  expect(page.hasText("Tesla Inc")).toBe(true);
  expect(page.hasText("248.67")).toBe(true);
  expect(page.hasText("+1.13%")).toBe(true);
});

test("a negative change keeps its own sign", async () => {
  await page.mount({ ...ROW, changePct: -1.06 }, 8, (): void => {});
  expect(page.hasText("08")).toBe(true);
  expect(page.hasText("-1.06%")).toBe(true);
});

test("renders placeholders rather than NaN before the first quote", async () => {
  await page.mount(
    { symbol: "ZZZZ", name: "Pending", last: null, changePct: null },
    9,
    (): void => {},
  );
  expect(page.hasText("NaN")).toBe(false);
  expect(page.hasText("—")).toBe(true);
});

test("pressing the row selects its symbol", async () => {
  const onSelect = jest.fn();

  await page.mount(ROW, 1, onSelect);
  await page.press("eq-mover-TSLA");
  expect(onSelect).toHaveBeenCalledWith("TSLA");
});

// dc.html:340 — the design's mover row is a `--tile-bg` / `--tile-shadow`
// surface like the rates tiles, so 3d skins paint the tile gradient on it.
test("renders the gradient tile surface on 3d skins", async () => {
  await page.mount(ROW, 1, (): void => {}, rnThemeTokens.holo3d.dark);
  expect(page.exists("surface-sheen")).toBe(true);
});

test("flat skins render no gradient tile surface", async () => {
  // page.mount defaults to holo.dark (flat, `tileGradient: null`).
  await page.mount(ROW, 1, (): void => {});
  expect(page.exists("surface-sheen")).toBe(false);
});
