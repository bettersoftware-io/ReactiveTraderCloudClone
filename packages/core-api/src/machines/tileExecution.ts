import type { Direction, ExecutionStatus, Price, Trade } from "@rtc/domain";

/** The execution lifecycle of a single tile, relocated out of the old
 * useTileState + useExecuteTrade React hooks. The overlay reads this state. */
export type TileExecutionState =
  | { status: "ready" }
  | { status: "started" }
  | { status: "tooLong" }
  | { status: "finished"; executionStatus: ExecutionStatus; trade?: Trade }
  | { status: "timeout" };

export interface TileExecutionIntents {
  /** Mirrors the args Tile.tsx passes today: direction, the (possibly
   * synthetic RFQ) price, and the resolved notional. */
  execute: (direction: Direction, price: Price, notional: number) => void;
  dismiss: () => void;
}
