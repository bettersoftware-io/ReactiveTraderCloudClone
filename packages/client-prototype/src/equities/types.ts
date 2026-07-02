export type EqSym =
  | "AAPL"
  | "MSFT"
  | "NVDA"
  | "TSLA"
  | "AMZN"
  | "GOOGL"
  | "META"
  | "SPY";

export type Timeframe = "1D" | "1W" | "1M" | "3M";
export type OrderSide = "Buy" | "Sell";
export type OrderType = "Market" | "Limit";
type OrderStatus = "Filled" | "Working";
export type WlSort = "sym" | "chg" | "price";

export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface EqMeta {
  name: string;
  exch: string;
  px: number;
}

export interface EqOrder {
  id: number;
  time: string;
  sym: EqSym;
  side: OrderSide;
  type: OrderType;
  qty: number;
  price: number;
  status: OrderStatus;
}

export interface EqPosition {
  sym: EqSym;
  qty: string;
  avg: string;
  last: string;
  mv: string;
  pl: string;
  plColor: string;
}

export interface EqTicket {
  side: OrderSide;
  type: OrderType;
  qty: string;
  limit: string;
}
