// packages/client-react-native/src/ui/rates/ticket/TradeTicketSheet.test.tsx
import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { CurrencyPair, Price } from "@rtc/domain";
import { Direction, PriceMovementType } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const mockExecute = jest.fn();
const mockPrice: Price = {
  symbol: "EURUSD",
  bid: 1.08716,
  ask: 1.0873,
  mid: 1.08723,
  spread: "1.4",
  movementType: PriceMovementType.UP,
  valueDate: "",
  creationTimestamp: 0,
};

const { TradeTicketSheet } =
  require("./TradeTicketSheet") as typeof import("./TradeTicketSheet");

const pair: CurrencyPair = {
  symbol: "EURUSD",
  ratePrecision: 5,
  pipsPosition: 4,
  base: "EUR",
  terms: "USD",
  defaultNotional: 1_000_000,
  baseMid: 1.08,
  typicalSpreadPips: 1,
};

test("executes a buy at the current notional", async () => {
  await renderWithTheme(<TradeTicketSheet pair={pair} onClose={jest.fn()} />);
  expect(screen.getByText("EUR/USD")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("buy-pad"));
  expect(mockExecute).toHaveBeenCalledWith(Direction.Buy, mockPrice, 1_000_000);
});

jest.mock("@rtc/react-bindings", () => {
  return {
    useViewModel: () => {
      return {
        usePrice: () => {
          return mockPrice;
        },
        useNotional: () => {
          return {
            state: {
              displayValue: "1,000,000",
              numericValue: 1_000_000,
              error: null,
            },
            change: jest.fn(),
            reset: jest.fn(),
          };
        },
        useTileExecution: () => {
          return {
            state: { status: "ready" },
            execute: mockExecute,
            dismiss: jest.fn(),
          };
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
  };
});
