export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderStatus =
  | "new"
  | "working"
  | "partiallyFilled"
  | "filled"
  | "cancelled"
  | "rejected";

export interface EquityOrder {
  readonly id: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly type: OrderType;
  readonly qty: number;
  readonly limitPrice?: number;
  readonly status: OrderStatus;
  readonly filledQty: number;
  readonly avgPrice?: number;
  readonly createdAt: number;
}
