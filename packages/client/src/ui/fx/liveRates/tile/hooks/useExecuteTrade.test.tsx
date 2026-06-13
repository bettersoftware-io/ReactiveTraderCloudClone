import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { of, throwError, type Observable } from "rxjs";
import {
  Direction,
  ExecutionStatus,
  TradeStatus,
  KNOWN_CURRENCY_PAIRS,
  PriceMovementType,
  type Price,
  type Trade,
  type ExecuteTradeInput,
  type ExecuteTradeResult,
} from "@rtc/domain";
import type { ReactNode } from "react";
import { HooksProvider } from "../../../../hooks/HooksProvider";
import type { AppHooks } from "../../../../hooks/createAppHooks";
import { useExecuteTrade } from "./useExecuteTrade";
import type { UseTileStateResult } from "./useTileState";

const pair = KNOWN_CURRENCY_PAIRS[0];

const price: Price = {
  symbol: "EURUSD",
  bid: 1.0921,
  ask: 1.0925,
  mid: 1.0923,
  valueDate: "2026-06-15",
  creationTimestamp: 1,
  movementType: PriceMovementType.NONE,
  spread: "4.0",
};

const trade: Trade = {
  tradeId: 1,
  tradeName: "t",
  currencyPair: "EURUSD",
  notional: 1_000_000,
  dealtCurrency: "EUR",
  direction: Direction.Buy,
  spotRate: 1.0925,
  status: TradeStatus.Done,
  tradeDate: "2026-06-13",
  valueDate: "2026-06-15",
};

function makeTileState(): UseTileStateResult {
  return {
    state: { status: "ready" },
    start: vi.fn(),
    finish: vi.fn(),
    dismiss: vi.fn(),
  };
}

function wrapper(execute: (input: ExecuteTradeInput) => Observable<ExecuteTradeResult>) {
  const hooks = { useExecuteTrade: () => execute } as unknown as AppHooks;
  return ({ children }: { children: ReactNode }) => (
    <HooksProvider hooks={hooks}>{children}</HooksProvider>
  );
}

describe("useExecuteTrade", () => {
  it("starts the tile, executes, and finishes with the result status and trade", async () => {
    const tileState = makeTileState();
    const execute = vi.fn(() => of({ status: ExecutionStatus.Done, trade }));
    const { result } = renderHook(() => useExecuteTrade(pair, tileState), {
      wrapper: wrapper(execute),
    });
    await act(async () => {
      await result.current(Direction.Buy, price, 1_000_000);
    });
    expect(tileState.start).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      pair,
      direction: Direction.Buy,
      price,
      notional: 1_000_000,
    });
    expect(tileState.finish).toHaveBeenCalledWith(ExecutionStatus.Done, trade);
  });

  it("finishes with a timeout status when the execute stream errors", async () => {
    const tileState = makeTileState();
    const execute = vi.fn(() => throwError(() => new Error("boom")) as Observable<ExecuteTradeResult>);
    const { result } = renderHook(() => useExecuteTrade(pair, tileState), {
      wrapper: wrapper(execute),
    });
    await act(async () => {
      await result.current(Direction.Sell, price, 500_000);
    });
    expect(tileState.start).toHaveBeenCalledTimes(1);
    expect(tileState.finish).toHaveBeenCalledWith(ExecutionStatus.Timeout);
  });
});
