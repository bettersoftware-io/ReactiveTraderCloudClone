import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { CurrencyPair } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const mockPairs = jest.fn();

const { RatesModule } =
  require("./RatesModule") as typeof import("./RatesModule");

test("renders tiles and filters them", async () => {
  mockPairs.mockReturnValue([pair("EURUSD"), pair("USDJPY"), pair("EURJPY")]);
  await renderWithTheme(<RatesModule />);

  expect(screen.getByTestId("spot-tile-EURUSD")).toBeTruthy();
  expect(screen.getByTestId("spot-tile-USDJPY")).toBeTruthy();

  await fireEvent.press(screen.getByText("JPY"));
  expect(screen.queryByTestId("spot-tile-EURUSD")).toBeNull();
  expect(screen.getByTestId("spot-tile-USDJPY")).toBeTruthy();
  expect(screen.getByTestId("spot-tile-EURJPY")).toBeTruthy();
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
