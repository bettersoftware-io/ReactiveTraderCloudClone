import type { Direction } from "../fx/trade.js";

export interface CreditTrade {
  readonly tradeId: number;
  readonly status: "accepted";
  readonly tradeDate: string; // ISO date "YYYY-MM-DD"; formatted at the cell layer (matches FX)
  readonly direction: Direction;
  readonly counterParty: string;
  readonly cusip: string;
  readonly security: string;
  readonly quantity: number;
  readonly orderType: "AON";
  readonly unitPrice: number;
}
