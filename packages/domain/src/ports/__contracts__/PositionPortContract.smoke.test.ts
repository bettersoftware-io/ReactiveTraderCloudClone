import { of } from "rxjs";
import { describe } from "vitest";

import type { PositionPort } from "../positionPort.js";
import { describePositionPortContract } from "./PositionPortContract.js";

describe("describePositionPortContract :: smoke", () => {
  describePositionPortContract("inline fake", () => {
    const qty = 100;
    const avgPrice = 150;
    const markPrice = 155;
    const unrealisedPnl = qty * (markPrice - avgPrice); // 500

    const port: PositionPort = {
      positions: () => {
        return of([
          { symbol: "AAPL", qty, avgPrice, markPrice, unrealisedPnl },
        ] as const);
      },
    };

    return {
      port,
      driver: { ackPositions: async () => {} },
      teardown: () => {},
    };
  });
});
