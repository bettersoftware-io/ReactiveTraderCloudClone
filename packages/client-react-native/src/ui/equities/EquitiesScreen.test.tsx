import { expect, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { OrderTicketState } from "@rtc/client-core";
import type { Candle, DepthBook, EquityInstrument } from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { EquitiesScreen } from "#/ui/equities/EquitiesScreen";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const editing: OrderTicketState = {
  phase: "editing",
  form: { symbol: "AAPL", side: "buy", type: "market", qty: 0 },
  error: null,
};

test("starts on Markets", async () => {
  await renderScreen();
  expect(screen.getByTestId("equities-screen")).toBeTruthy();
  expect(screen.getByTestId("markets-view")).toBeTruthy();
});

test("Trade prompts until a symbol is chosen", async () => {
  await renderScreen();
  await fireEvent.press(screen.getByTestId("equities-tab-trade"));
  expect(screen.getByTestId("trade-empty")).toBeTruthy();
});

test("selecting a watchlist instrument jumps to Trade for that symbol", async () => {
  await renderScreen();
  await fireEvent.press(screen.getByTestId("watchlist-row-AAPL"));
  expect(screen.getByTestId("instrument-tab-AAPL")).toBeTruthy();
  expect(screen.getByTestId("order-ticket")).toBeTruthy();
});

test("Blotters view is reachable", async () => {
  await renderScreen();
  await fireEvent.press(screen.getByTestId("equities-tab-blotters"));
  expect(screen.getByTestId("blotter-toggle-orders")).toBeTruthy();
});

function vm(): ViewModel {
  return {
    useWatchlist: (): readonly EquityInstrument[] => {
      return [{ symbol: "AAPL", name: "Apple", exchange: "NASDAQ" }];
    },
    useEquityQuote: () => {
      return null;
    },
    useCandles: (): readonly Candle[] => {
      return [];
    },
    useDepth: (): DepthBook | null => {
      return null;
    },
    useEquityOrders: () => {
      return [];
    },
    useEquityPositions: () => {
      return [];
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

async function renderScreen(): Promise<void> {
  await renderWithTheme(
    <ViewModelProvider viewModel={vm()}>
      <EquitiesScreen />
    </ViewModelProvider>,
  );
}
