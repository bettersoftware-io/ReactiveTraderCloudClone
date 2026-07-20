import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { PriceMovementType } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const mockUsePrice = jest.fn();
const mockMotion = jest.fn<() => boolean>(() => {
  return true;
});

const { SpotTile } = require("./SpotTile") as typeof import("./SpotTile");

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
  await renderWithTheme(<SpotTile pair={pair} onOpenTicket={onOpen} />);

  expect(screen.getByText("EUR/USD")).toBeTruthy();
  expect(screen.getByTestId("spot-tile-pips-EURUSD")).toBeTruthy(); // ask big digits

  await fireEvent.press(screen.getByTestId("spot-tile-EURUSD"));
  expect(onOpen).toHaveBeenCalledWith(pair);
});

test("shows a loading state before the first price", async () => {
  mockUsePrice.mockReturnValue(null);
  await renderWithTheme(<SpotTile pair={pair} onOpenTicket={jest.fn()} />);
  expect(screen.getByText(/Loading/i)).toBeTruthy();
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
