import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import {
  type CurrencyPair,
  Direction,
  ExecutionStatus,
  type Price,
  PriceMovementType,
} from "@rtc/domain";
import { type ViewModel, ViewModelProvider } from "@rtc/react-bindings";

import { TradeTicket } from "#/ui/TradeTicket";

const EURUSD: CurrencyPair = {
  symbol: "EURUSD",
  ratePrecision: 5,
  pipsPosition: 4,
  base: "EUR",
  terms: "USD",
  defaultNotional: 1_000_000,
};

const PRICE: Price = {
  symbol: "EURUSD",
  bid: 1.53812,
  ask: 1.53818,
  mid: 1.53815,
  valueDate: "",
  creationTimestamp: 0,
  movementType: PriceMovementType.UP,
  spread: "0.6",
};

type ExecFn = (d: Direction, p: Price, n: number) => void;

function noop(): void {
  // Intentionally does nothing.
}

// A fake ViewModel exposing the three hooks TradeTicket uses. `execState` and
// the notional `error` are parameters so a test can pin any machine state.
function fakeViewModel(opts: {
  execute: ExecFn;
  execState?: ReturnType<ViewModel["useTileExecution"]>["state"];
  error?: string | null;
}): ViewModel {
  const state = opts.execState ?? { status: "ready" as const };
  return {
    usePrice: () => PRICE,
    useNotional: () => ({
      state: {
        displayValue: "1,000,000",
        numericValue: 1_000_000,
        error: opts.error ?? null,
        isRfq: false,
        isDefault: true,
      },
      change: () => undefined,
      reset: () => undefined,
    }),
    useTileExecution: () => ({
      state,
      execute: opts.execute,
      dismiss: () => undefined,
    }),
  } as unknown as ViewModel;
}

test("tapping Buy executes with direction, price and notional", async () => {
  const execute = jest.fn<ExecFn>();
  await render(
    <ViewModelProvider viewModel={fakeViewModel({ execute })}>
      <TradeTicket pair={EURUSD} onClose={noop} />
    </ViewModelProvider>,
  );
  fireEvent.press(screen.getByTestId("buy-btn"));
  expect(execute).toHaveBeenCalledWith(Direction.Buy, PRICE, 1_000_000);
});

test("Buy/Sell disabled when the notional has an error", async () => {
  const execute = jest.fn<ExecFn>();
  await render(
    <ViewModelProvider
      viewModel={fakeViewModel({ execute, error: "Too small" })}
    >
      <TradeTicket pair={EURUSD} onClose={noop} />
    </ViewModelProvider>,
  );
  fireEvent.press(screen.getByTestId("buy-btn"));
  expect(execute).not.toHaveBeenCalled();
  expect(screen.getByTestId("notional-error")).toBeTruthy();
});

test("shows a Done confirmation when the machine finishes", async () => {
  await render(
    <ViewModelProvider
      viewModel={fakeViewModel({
        execute: () => undefined,
        execState: {
          status: "finished",
          executionStatus: ExecutionStatus.Done,
        },
      })}
    >
      <TradeTicket pair={EURUSD} onClose={noop} />
    </ViewModelProvider>,
  );
  expect(screen.getByTestId("exec-status").props.children).toContain("Done");
});

test("auto-closes when a terminal state dismisses back to ready", async () => {
  const onClose = jest.fn<() => void>();
  const { rerender } = await render(
    <ViewModelProvider
      viewModel={fakeViewModel({
        execute: () => undefined,
        execState: {
          status: "finished",
          executionStatus: ExecutionStatus.Done,
        },
      })}
    >
      <TradeTicket pair={EURUSD} onClose={onClose} />
    </ViewModelProvider>,
  );
  expect(onClose).not.toHaveBeenCalled();
  await rerender(
    <ViewModelProvider
      viewModel={fakeViewModel({
        execute: () => undefined,
        execState: { status: "ready" },
      })}
    >
      <TradeTicket pair={EURUSD} onClose={onClose} />
    </ViewModelProvider>,
  );
  expect(onClose).toHaveBeenCalledTimes(1);
});
