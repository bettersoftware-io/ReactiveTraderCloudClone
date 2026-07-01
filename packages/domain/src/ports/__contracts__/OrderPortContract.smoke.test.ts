import { concat, EMPTY, of } from "rxjs";
import { describe } from "vitest";

import type { EquityOrder } from "#/equities/order.js";

import type { OrderPort, PlaceOrderRequest } from "../orderPort.js";
import { describeOrderPortContract } from "./OrderPortContract.js";

describe("describeOrderPortContract :: smoke", () => {
  describeOrderPortContract("inline fake", () => {
    function makeOrder(
      status: "new" | "working" | "filled",
      filledQty: number,
      qty: number,
    ): EquityOrder {
      return {
        id: "ord-1",
        symbol: "AAPL",
        side: "buy" as const,
        type: "market" as const,
        qty,
        status,
        filledQty,
        createdAt: 0,
      };
    }

    const port: OrderPort = {
      place: ({ qty }: PlaceOrderRequest) => {
        return concat(
          of(makeOrder("new", 0, qty)),
          of(makeOrder("working", 0, qty)),
          of(makeOrder("filled", qty, qty)),
        );
      },
      cancel: (_orderId: string) => {
        return EMPTY;
      },
      orders: () => {
        return of([makeOrder("filled", 100, 100)] as const);
      },
    };

    return {
      port,
      driver: {
        settlePlacement: async () => {},
        ackOrders: async () => {},
        ackCancel: async () => {},
      },
      teardown: () => {},
    };
  });
});
