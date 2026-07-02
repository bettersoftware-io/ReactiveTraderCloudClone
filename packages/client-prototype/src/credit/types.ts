export type Dir = "Buy" | "Sell";
export type QuoteState = "pending" | "priced" | "passed" | "accepted";
export type RfqState = "Open" | "Closed" | "Cancelled" | "Expired";
export type CreditTab = "live" | "closed" | "all";

export interface Instrument {
  id: number;
  ticker: string;
  name: string;
  cusip: string;
  ref: number;
}

export interface Dealer {
  id: number;
  name: string;
}

export interface Quote {
  dealerId: number;
  state: QuoteState;
  price: number | null;
}

export interface Rfq {
  id: number;
  state: RfqState;
  dir: Dir;
  instrumentId: number;
  qty: number;
  dealerIds: number[];
  quotes: Quote[];
  acceptedDealerId: number | null;
  createdAt: number;
  expirySecs: number;
  exitAt?: number;
}

export interface CreditTrade {
  id: number;
  status: string;
  date: string;
  dir: Dir;
  cp: string;
  cusip: string;
  sec: string;
  qty: string;
  ot: string;
  price: string;
}
