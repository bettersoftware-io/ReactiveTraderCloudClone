import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import { type CurrencyPair, type Price, PriceMovementType } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { SpotTile } from "#/ui/SpotTile";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { rnThemeTokens } from "#/ui/theme/tokens";

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
  baseMid: 1.09213,
  typicalSpreadPips: 1.4,
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

const DOWN_PRICE: Price = {
  ...UP_PRICE,
  movementType: PriceMovementType.DOWN,
};

test("renders pair, ask split, spread and up-movement", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(UP_PRICE)}>
      <SpotTile pair={EURUSD} />
    </ViewModelProvider>,
  );
  expect(screen.getByText("EUR / USD")).toBeTruthy();
  expect(screen.getByText("81")).toBeTruthy(); // ask pips (enlarged, coloured)
  expect(screen.getByText("0.6")).toBeTruthy(); // spread
  expect(screen.getByText("1.53812")).toBeTruthy(); // bid (footer)
  expect(screen.getByText("1.53818")).toBeTruthy(); // ask (footer)
  expect(
    screen.getByTestId("spot-tile-movement", { includeHiddenElements: true })
      .props.children,
  ).toBe(PriceMovementType.UP);
});

test("shows loading when price is null", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(null)}>
      <SpotTile pair={EURUSD} />
    </ViewModelProvider>,
  );
  expect(screen.getByText("EUR / USD")).toBeTruthy();
  expect(screen.getByText("Loading…")).toBeTruthy();
});

test("pressing the tile opens the trade ticket", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(UP_PRICE)}>
      <SpotTile pair={EURUSD} />
    </ViewModelProvider>,
  );
  expect(screen.queryByTestId("trade-ticket")).toBeNull();
  await fireEvent.press(screen.getByTestId("spot-tile"));
  expect(screen.getByTestId("trade-ticket")).toBeTruthy();
});

// Discriminating colour checks: the pips <Text> is the sibling that carries
// the movement colour (prefix/fractional stay theme.textPrimary). Reading
// its rendered `style.color` fails this test the moment movement stops
// mapping to the theme's accent tokens (e.g. UP/DOWN swapped, or a token
// renamed without updating the mapping).
test("paints the ask pips with the positive accent colour on an up-move", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(UP_PRICE)}>
      <SpotTile pair={EURUSD} />
    </ViewModelProvider>,
  );
  expect(screen.getByText("81").props.style.color).toBe(
    rnThemeTokens.holo.dark.accentPositive,
  );
});

test("paints the ask pips with the negative accent colour on a down-move", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fakeViewModel(DOWN_PRICE)}>
      <SpotTile pair={EURUSD} />
    </ViewModelProvider>,
  );
  expect(screen.getByText("81").props.style.color).toBe(
    rnThemeTokens.holo.dark.accentNegative,
  );
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
