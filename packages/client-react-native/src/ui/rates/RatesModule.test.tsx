import { expect, jest, test } from "@jest/globals";

import type { CurrencyPair } from "@rtc/domain";

import { ratesModulePage } from "#tests/pages/RatesModulePage";

const mockPairs = jest.fn();

const page = ratesModulePage();

test("renders tiles and filters them", async () => {
  mockPairs.mockReturnValue([pair("EURUSD"), pair("USDJPY"), pair("EURJPY")]);
  await page.mount();

  expect(page.exists("spot-tile-EURUSD")).toBeTruthy();
  expect(page.exists("spot-tile-USDJPY")).toBeTruthy();

  await page.pressText("JPY");
  expect(page.exists("spot-tile-EURUSD")).toBe(false);
  expect(page.exists("spot-tile-USDJPY")).toBeTruthy();
  expect(page.exists("spot-tile-EURJPY")).toBeTruthy();
  await page.unmountAll();
});

function pair(symbol: string): CurrencyPair {
  return {
    symbol,
    ratePrecision: 5,
    pipsPosition: 4,
    base: symbol.slice(0, 3),
    terms: symbol.slice(3),
    defaultNotional: 1_000_000,
    baseMid: 1,
    typicalSpreadPips: 1,
  };
}

jest.mock("@rtc/react-bindings", () => {
  return {
    useViewModel: () => {
      return {
        useCurrencyPairs: mockPairs,
        usePrice: () => {
          return null;
        },
      };
    },
  };
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return false;
    },
  }; // static in tests — no reanimated layout
});
