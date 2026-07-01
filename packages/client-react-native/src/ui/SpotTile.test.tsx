import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { type CurrencyPair, type Price, PriceMovementType } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { SpotTile } from "#/ui/SpotTile";

// Stub out TradeTicket (an RN Modal) so the press test mounts a lightweight
// marker instead of the real Modal — mounting Modal via an awaited RNTL event
// hangs jest-expo on x86 CI (TradeTicket.test.tsx covers the real Modal by
// rendering it directly on initial render, which does not hang).
jest.mock("#/ui/TradeTicket", () => {
  const react = require("react");
  const { View } = require("react-native");
  return {
    TradeTicket: (): unknown => {
      return react.createElement(View, { testID: "trade-ticket" });
    },
  };
});

const EURUSD: CurrencyPair = {
  symbol: "EURUSD",
  ratePrecision: 5,
  pipsPosition: 4,
  base: "EUR",
  terms: "USD",
  defaultNotional: 1_000_000,
};

const UP_PRICE: Price = {
  symbol: "EURUSD",
  bid: 1.53812,
  ask: 1.53818,
  mid: 1.53815,
  valueDate: "",
  creationTimestamp: 0,
  movementType: PriceMovementType.UP,
  spread: "0.6",
};

test("renders symbol, ask split, spread and up-movement", async () => {
  await render(
    <ViewModelProvider viewModel={fakeViewModel(UP_PRICE)}>
      <SpotTile pair={EURUSD} />
    </ViewModelProvider>,
  );
  expect(screen.getByText("EURUSD")).toBeTruthy();
  expect(screen.getByText("0.6")).toBeTruthy();
  expect(
    screen.getByTestId("spot-tile-movement", { includeHiddenElements: true })
      .props.children,
  ).toBe(PriceMovementType.UP);
});

test("shows loading when price is null", async () => {
  await render(
    <ViewModelProvider viewModel={fakeViewModel(null)}>
      <SpotTile pair={EURUSD} />
    </ViewModelProvider>,
  );
  expect(screen.getByText("EURUSD")).toBeTruthy();
  expect(screen.getByText("Loading…")).toBeTruthy();
});

test("pressing the tile opens the trade ticket", async () => {
  await render(
    <ViewModelProvider viewModel={fakeViewModel(UP_PRICE)}>
      <SpotTile pair={EURUSD} />
    </ViewModelProvider>,
  );
  expect(screen.queryByTestId("trade-ticket")).toBeNull();
  await fireEvent.press(screen.getByTestId("spot-tile"));
  expect(screen.getByTestId("trade-ticket")).toBeTruthy();
});

function fakeViewModel(price: Price | null): ViewModel {
  return {
    usePrice: () => {
      return price;
    },
    useNotional: () => {
      return {
        state: {
          displayValue: "1,000,000",
          numericValue: 1_000_000,
          error: null,
          isRfq: false,
          isDefault: true,
        },
        change: () => {
          return undefined;
        },
        reset: () => {
          return undefined;
        },
      };
    },
    useTileExecution: () => {
      return {
        state: { status: "ready" as const },
        execute: () => {
          return undefined;
        },
        dismiss: () => {
          return undefined;
        },
      };
    },
  } as unknown as ViewModel;
}
