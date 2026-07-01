export type Sym =
  | "EURUSD"
  | "GBPUSD"
  | "USDJPY"
  | "EURJPY"
  | "GBPJPY"
  | "AUDUSD"
  | "USDCAD"
  | "NZDUSD";

export interface PairMeta {
  pair: string;
  base: string;
  d: number;
  bigLen: number;
  spread: string;
}

export type Dir = "Buy" | "Sell";

export interface SplitPrice {
  big: string;
  pips: string;
  frac: string;
}

export interface Trade {
  id: number;
  status: "Done" | "Rejected";
  dir: Dir;
  symbol: Sym;
  dealtCcy: string;
  notional: string;
  notionalNum: number;
  rate: string;
  trader: string;
  tradeDate: string;
  valueDate: string;
}

type TileStage =
  | "idle"
  | "executing"
  | "rfqReq"
  | "rfqRecv"
  | "success"
  | "failure";

interface TileTrade {
  id: number;
  dir?: Dir;
  notional?: string;
  rate?: string;
}

export interface TileState {
  stage: TileStage;
  trade?: TileTrade;
  quote?: { Sell: string; Buy: string };
  rfqStart?: number;
  rfqEnd?: number;
}

export interface ActivityEvent {
  t: string;
  tag: string;
  msg: string;
  color: string;
}
