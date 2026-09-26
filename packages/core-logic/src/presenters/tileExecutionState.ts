import type { TileExecutionState } from "@rtc/core-api";
import { type ExecuteTradeResult, ExecutionStatus } from "@rtc/domain";

export const READY_TILE_EXECUTION: TileExecutionState = { status: "ready" };
export const STARTED_TILE_EXECUTION: TileExecutionState = { status: "started" };
export const TOO_LONG_TILE_EXECUTION: TileExecutionState = {
  status: "tooLong",
};
/** The local `EXECUTION_TIMEOUT_MS` timer fired with no result at all. */
export const TIMEOUT_TILE_EXECUTION: TileExecutionState = { status: "timeout" };
/** The command itself failed — reported as a finished execution with the
 * Timeout status, NOT as the `timeout` state above. */
export const TIMED_OUT_TILE_EXECUTION: TileExecutionState = {
  status: "finished",
  executionStatus: ExecutionStatus.Timeout,
};

export function finishedTileExecution(
  result: ExecuteTradeResult,
): TileExecutionState {
  return {
    status: "finished",
    executionStatus: result.status,
    trade: result.trade,
  };
}

export function isTerminalTileExecution(state: TileExecutionState): boolean {
  return state.status === "finished" || state.status === "timeout";
}
