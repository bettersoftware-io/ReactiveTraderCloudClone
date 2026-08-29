import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { OrderTicketState } from "@rtc/client-core";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { OrderTicket } from "#/ui/equities/trade/OrderTicket";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { rnThemeTokens } from "#/ui/theme/tokens";

const editing: OrderTicketState = {
  phase: "editing",
  form: { symbol: "AAPL", side: "buy", type: "market", qty: 100 },
  error: null,
};

test("editing phase submits with the current side and symbol", async () => {
  const submit = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(editing, { submit })}>
      <OrderTicket symbol="AAPL" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("order-ticket-submit")).toHaveTextContent(
    "BUY 100 AAPL · MARKET",
  );
  await fireEvent.press(screen.getByTestId("order-ticket-submit"));
  expect(submit).toHaveBeenCalledTimes(1);
});

test("quantity chips dispatch setQty and light the matching preset", async () => {
  const setQty = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(editing, { setQty })}>
      <OrderTicket symbol="AAPL" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("order-ticket-qty-1000")).toHaveTextContent("1K");
  expect(screen.getByTestId("order-ticket-qty-5000")).toHaveTextContent("5K");
  expect(selected("order-ticket-qty-100")).toBe(true);
  expect(selected("order-ticket-qty-500")).toBe(false);
  await fireEvent.press(screen.getByTestId("order-ticket-qty-5000"));
  expect(setQty).toHaveBeenCalledWith(5000);
});

test("LMT shows the limit stepper seeded from the last price, stepping by a dime", async () => {
  const setLimitPrice = jest.fn();
  const limitEditing: OrderTicketState = {
    phase: "editing",
    form: { symbol: "AAPL", side: "sell", type: "limit", qty: 1000 },
    error: null,
  };
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(limitEditing, { setLimitPrice })}>
      <OrderTicket symbol="AAPL" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("order-ticket-limit")).toHaveTextContent("189.50");
  await fireEvent.press(screen.getByTestId("order-ticket-limit-up"));
  expect(setLimitPrice).toHaveBeenCalledWith(189.6);
  await fireEvent.press(screen.getByTestId("order-ticket-limit-down"));
  expect(setLimitPrice).toHaveBeenCalledWith(189.4);
  expect(screen.getByTestId("order-ticket-submit")).toHaveTextContent(
    "SELL 1K AAPL · @ 189.50",
  );
});

test("a set limit price wins over the last price", async () => {
  const limitEditing: OrderTicketState = {
    phase: "editing",
    form: {
      symbol: "AAPL",
      side: "buy",
      type: "limit",
      qty: 500,
      limitPrice: 131.14,
    },
    error: null,
  };
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(limitEditing)}>
      <OrderTicket symbol="AAPL" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("order-ticket-limit")).toHaveTextContent("131.14");
  expect(screen.getByTestId("order-ticket-submit")).toHaveTextContent(
    "BUY 500 AAPL · @ 131.14",
  );
});

test("MKT hides the stepper and the CTA omits an unset quantity", async () => {
  const bare: OrderTicketState = {
    phase: "editing",
    form: { symbol: "AAPL", side: "buy", type: "market", qty: 0 },
    error: null,
  };
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(bare)}>
      <OrderTicket symbol="AAPL" />
    </ViewModelProvider>,
  );
  expect(screen.queryByTestId("order-ticket-limit")).toBeNull();
  expect(screen.getByTestId("order-ticket-submit")).toHaveTextContent(
    "BUY AAPL · MARKET",
  );
});

test("filled phase shows the fill summary and a reset control", async () => {
  const reset = jest.fn();
  const filled: OrderTicketState = {
    phase: "filled",
    order: {
      id: "o1",
      symbol: "AAPL",
      side: "buy",
      type: "market",
      qty: 100,
      status: "filled",
      filledQty: 100,
      avgPrice: 182.4,
      createdAt: 0,
    },
  };
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(filled, { reset })}>
      <OrderTicket symbol="AAPL" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("order-ticket")).toHaveTextContent("FILLED", {
    exact: false,
  });
  await fireEvent.press(screen.getByTestId("order-ticket-reset"));
  expect(reset).toHaveBeenCalledTimes(1);
});

test("rejected phase surfaces the reason", async () => {
  const rejected: OrderTicketState = {
    phase: "rejected",
    reason: "Insufficient buying power",
  };
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(rejected)}>
      <OrderTicket symbol="AAPL" />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("order-ticket")).toHaveTextContent(
    "Insufficient buying power",
    { exact: false },
  );
});

test("renders no gradient tile surface even on a 3d skin (dense panel, not a hero tile)", async () => {
  const submit = jest.fn();
  await renderWithTheme(
    <ViewModelProvider viewModel={vmWith(editing, { submit })}>
      <OrderTicket symbol="AAPL" />
    </ViewModelProvider>,
    rnThemeTokens.holo3d.dark,
  );
  expect(screen.queryByTestId("surface-sheen")).toBeNull();
});

function vmWith(
  state: OrderTicketState,
  intents: Partial<Record<string, unknown>> = {},
): ViewModel {
  return {
    useEquityQuote: () => {
      return {
        symbol: "AAPL",
        bid: 0,
        ask: 0,
        last: 189.5,
        changePct: 0.42,
        timestamp: 0,
      };
    },
    useOrderTicket: () => {
      return {
        state,
        setSide: intents.setSide ?? (() => {}),
        setType: intents.setType ?? (() => {}),
        setQty: intents.setQty ?? (() => {}),
        setLimitPrice: intents.setLimitPrice ?? (() => {}),
        submit: intents.submit ?? (() => {}),
        reset: intents.reset ?? (() => {}),
      };
    },
  } as unknown as ViewModel;
}

// `vmWith` doesn't stub `usePowerSaver`, which `OrderCeremony`'s fill/reject
// toast would otherwise call via `useShellMotionEnabled` on the filled/
// rejected phases — mirrors TradeView.test.tsx / EquitiesScreen.test.tsx.
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});

function selected(testId: string): boolean {
  const state = screen.getByTestId(testId).props.accessibilityState as
    | { selected?: boolean }
    | undefined;
  return state?.selected === true;
}
