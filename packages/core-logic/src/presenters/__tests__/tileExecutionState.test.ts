import { describe, expect, it } from "vitest";

import {
  Direction,
  ExecutionStatus,
  type Trade,
  TradeStatus,
} from "@rtc/domain";

import {
  finishedTileExecution,
  isTerminalTileExecution,
  READY_TILE_EXECUTION,
  STARTED_TILE_EXECUTION,
  TIMED_OUT_TILE_EXECUTION,
  TIMEOUT_TILE_EXECUTION,
  TOO_LONG_TILE_EXECUTION,
} from "#/presenters/tileExecutionState";

describe("tileExecutionState", () => {
  it("only finished and timeout are terminal", () => {
    expect(isTerminalTileExecution(READY_TILE_EXECUTION)).toBe(false);
    expect(isTerminalTileExecution(STARTED_TILE_EXECUTION)).toBe(false);
    expect(isTerminalTileExecution(TOO_LONG_TILE_EXECUTION)).toBe(false);
    expect(isTerminalTileExecution(TIMEOUT_TILE_EXECUTION)).toBe(true);
    expect(isTerminalTileExecution(TIMED_OUT_TILE_EXECUTION)).toBe(true);
  });

  it("finishedTileExecution carries the result's status and trade", () => {
    const trade: Trade = {
      tradeId: 1,
      tradeName: "You",
      currencyPair: "EURUSD",
      notional: 1,
      dealtCurrency: "EUR",
      direction: Direction.Buy,
      spotRate: 1,
      status: TradeStatus.Done,
      tradeDate: "2026-01-01",
      valueDate: "2026-01-03",
    };
    expect(
      finishedTileExecution({ trade, status: ExecutionStatus.Done }),
    ).toEqual({
      status: "finished",
      executionStatus: ExecutionStatus.Done,
      trade,
    });
    expect(TIMED_OUT_TILE_EXECUTION).toEqual({
      status: "finished",
      executionStatus: ExecutionStatus.Timeout,
    });
  });
});
