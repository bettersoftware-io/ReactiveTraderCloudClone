import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import type { OrderTicketState } from "@rtc/client-core";
import type {
  Candle,
  DepthBook,
  EquityInstrument,
  EquityQuote,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { TradeView } from "#/ui/equities/trade/TradeView";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const editing: OrderTicketState = {
  phase: "editing",
  form: { symbol: "AAPL", side: "buy", type: "market", qty: 0 },
  error: null,
};

test("prompts to pick an instrument when none is selected", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fullVM()}>
      <TradeView selectedSymbol={null} onSelect={(): void => {}} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("trade-empty")).toBeTruthy();
});

test("renders tabs, chart, depth and ticket for the selected symbol", async () => {
  await renderWithTheme(
    <ViewModelProvider viewModel={fullVM()}>
      <TradeView selectedSymbol="AAPL" onSelect={(): void => {}} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("instrument-tab-AAPL")).toBeTruthy();
  expect(screen.getByTestId("eq-candle-empty")).toBeTruthy(); // fullVM's useCandles is []
  expect(screen.getByTestId("depth-empty")).toBeTruthy(); // null book → empty
  expect(screen.getByTestId("order-ticket")).toBeTruthy();
});

function fullVM(): ViewModel {
  return {
    useWatchlist: (): readonly EquityInstrument[] => {
      return [{ symbol: "AAPL", name: "Apple", exchange: "NASDAQ" }];
    },
    useEquityQuote: (): EquityQuote => {
      return {
        symbol: "AAPL",
        bid: 0,
        ask: 0,
        last: 189.5,
        changePct: 0.42,
        timestamp: 0,
      };
    },
    useCandles: (): readonly Candle[] => {
      return [];
    },
    useDepth: (): DepthBook | null => {
      return null;
    },
    useOrderTicket: () => {
      return {
        state: editing,
        setSide: () => {},
        setType: () => {},
        setQty: () => {},
        setLimitPrice: () => {},
        submit: () => {},
        reset: () => {},
      };
    },
  } as unknown as ViewModel;
}

// `fullVM()` doesn't stub `usePowerSaver`, which InstrumentHeader's
// useShellMotionEnabled would otherwise call — mirrors
// InstrumentHeader.test.tsx / SpotTile.test.tsx.
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});
