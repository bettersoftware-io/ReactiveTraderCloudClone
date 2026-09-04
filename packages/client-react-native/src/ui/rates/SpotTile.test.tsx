import { afterEach, expect, jest, test } from "@jest/globals";

import { PriceMovementType } from "@rtc/domain";

import { rnThemeTokens } from "#/ui/theme/tokens";
import { spotTilePage } from "#tests/pages/SpotTilePage";

const mockUsePrice = jest.fn();
const mockMotion = jest.fn<() => boolean>(() => {
  return true;
});

const page = spotTilePage();

afterEach(() => {
  return page.unmountAll();
});

const pair = {
  symbol: "EURUSD",
  ratePrecision: 5,
  pipsPosition: 4,
  base: "EUR",
  terms: "USD",
  defaultNotional: 1_000_000,
  baseMid: 1.08,
  typicalSpreadPips: 1,
};

test("renders the ask pips and opens the ticket on tap", async () => {
  mockUsePrice.mockReturnValue({
    symbol: "EURUSD",
    bid: 1.08716,
    ask: 1.0873,
    mid: 1.08723,
    spread: "1.4",
    movementType: PriceMovementType.UP,
    valueDate: "",
    creationTimestamp: 0,
  });
  const onOpen = jest.fn();
  await page.mount(pair, onOpen);

  expect(page.hasText("EUR/USD")).toBeTruthy();
  expect(page.exists("spot-tile-pips-EURUSD")).toBeTruthy(); // ask big digits

  await page.press("spot-tile-EURUSD");
  expect(onOpen).toHaveBeenCalledWith(pair);
});

test("shows a loading state before the first price", async () => {
  mockUsePrice.mockReturnValue(null);
  await page.mount(pair, jest.fn());
  expect(page.hasTextMatching(/Loading/i)).toBeTruthy();
});

// dc.html:108 — the design's price tile is a full `--tile-bg` /
// `--tile-shadow` surface, so 3d skins paint the vertical tile gradient.
test("renders the gradient tile surface on 3d skins", async () => {
  mockUsePrice.mockReturnValue(null);
  await page.mount(pair, jest.fn(), rnThemeTokens.holo3d.dark);
  expect(page.exists("surface-sheen")).toBeTruthy();
});

test("flat skins render no gradient tile surface", async () => {
  // renderWithTheme defaults to holo.dark (flat, `tileGradient: null`).
  mockUsePrice.mockReturnValue(null);
  await page.mount(pair, jest.fn());
  expect(page.exists("surface-sheen")).toBe(false);
});

jest.mock("@rtc/react-bindings", () => {
  return {
    useViewModel: () => {
      return { usePrice: mockUsePrice };
    },
  };
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return mockMotion();
    },
  };
});
