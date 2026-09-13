import type { EquityOrder, OrderSide, OrderType } from "@rtc/domain";

/** Moved alongside `OrderTicketState` (which embeds it in its "editing"
 * variant) — not itself in Task 3's move table, but `OrderTicketState`
 * cannot type-check in `@rtc/core-api` without it. `OrderTicketMachine.ts`
 * imports it back for its own local implementation use (`validate`, the
 * `Patch` alias, `initialForm`). */
export interface OrderTicketForm {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: number;
  limitPrice?: number;
}

export type OrderTicketState =
  | { phase: "editing"; form: OrderTicketForm; error: string | null }
  | { phase: "submitting" }
  | { phase: "working"; order: EquityOrder }
  | { phase: "partiallyFilled"; order: EquityOrder }
  | { phase: "filled"; order: EquityOrder }
  | { phase: "rejected"; reason: string };

export interface OrderTicketIntents {
  setSymbol(symbol: string): void;
  setSide(side: OrderSide): void;
  setType(type: OrderType): void;
  setQty(qty: number): void;
  setLimitPrice(price: number | undefined): void;
  submit(): void;
  reset(): void;
}
