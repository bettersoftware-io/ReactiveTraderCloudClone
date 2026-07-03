import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";

import type { OrderTicketState } from "@rtc/client-core";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { OrderTicket } from "#/ui/equities/trade/OrderTicket";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

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
    "BUY AAPL",
    { exact: false },
  );
  void fireEvent.press(screen.getByTestId("order-ticket-submit"));
  expect(submit).toHaveBeenCalledTimes(1);
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
  void fireEvent.press(screen.getByTestId("order-ticket-reset"));
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

function vmWith(
  state: OrderTicketState,
  intents: Partial<Record<string, unknown>> = {},
): ViewModel {
  return {
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
