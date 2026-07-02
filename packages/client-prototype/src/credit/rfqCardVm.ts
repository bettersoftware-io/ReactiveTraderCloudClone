import { DEALERS, fmtNum, INSTRUMENTS } from "#/credit/creditData";
import type { Dir, Quote, QuoteState, Rfq, RfqState } from "#/credit/types";

export interface QuoteVm {
  dealerId: number;
  bank: string;
  priceText: string;
  state: QuoteState;
  best: boolean;
  canAccept: boolean;
  house: boolean;
}

export interface RfqCardVm {
  rid: number;
  dir: Dir;
  ticker: string;
  cusip: string;
  qty: string;
  stateLabel: string;
  state: RfqState;
  quotes: QuoteVm[];
  live: boolean;
  accepted: boolean;
  terminated: boolean;
  secs: number;
  pct: number;
  acceptedDealer: string;
}

// PROTO L757: dealer id 1 ("Adaptive Bank") is the house dealer.
const HOUSE_DEALER_ID = 1;

// PROTO L1330 (rfqCards map): the streaming-quote card view model — lifecycle
// flags, countdown, and the per-dealer quote rows (best-price star, price
// text, and whether that quote can still be accepted).
export function rfqCardVm(r: Rfq, now: number): RfqCardVm {
  const inst = INSTRUMENTS.find((i) => {
    return i.id === r.instrumentId;
  });
  const live = r.state === "Open";
  const accepted = r.state === "Closed";
  const terminated = r.state === "Cancelled" || r.state === "Expired";
  const expiresAt = r.createdAt + r.expirySecs * 1000;
  const secs = live ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
  const pct = live
    ? Math.max(0, ((expiresAt - now) / (r.expirySecs * 1000)) * 100)
    : 0;
  const bestDealerId = findBestDealerId(r);
  const quotes = r.quotes.map((q) => {
    return quoteVm(q, live, bestDealerId);
  });

  return {
    rid: r.id,
    dir: r.dir,
    ticker: inst?.ticker ?? "",
    cusip: inst?.cusip ?? "",
    qty: fmtNum(r.qty),
    stateLabel: stateLabel(r.state),
    state: r.state,
    quotes,
    live,
    accepted,
    terminated,
    secs,
    pct,
    acceptedDealer: acceptedDealerName(r, accepted),
  };
}

interface PricedQuote {
  dealerId: number;
  price: number;
}

// PROTO L1330: the pool a "best" quote is drawn from is priced OR accepted
// (an already-accepted quote can still be the reference price), but a null
// price never actually occurs on those two states — the guard just keeps
// the comparison type-safe without a non-null assertion.
function pricedQuotes(r: Rfq): PricedQuote[] {
  const out: PricedQuote[] = [];

  for (const q of r.quotes) {
    if ((q.state === "priced" || q.state === "accepted") && q.price != null) {
      out.push({ dealerId: q.dealerId, price: q.price });
    }
  }

  return out;
}

// PROTO L1330: best = min price for a Buy, max price for a Sell.
function findBestDealerId(r: Rfq): number | null {
  const priced = pricedQuotes(r);

  if (priced.length === 0) {
    return null;
  }

  const best = priced.reduce((a, b) => {
    const bWins = r.dir === "Buy" ? b.price < a.price : b.price > a.price;
    return bWins ? b : a;
  });

  return best.dealerId;
}

function quoteVm(
  q: Quote,
  live: boolean,
  bestDealerId: number | null,
): QuoteVm {
  const dealer = DEALERS.find((d) => {
    return d.id === q.dealerId;
  });
  // PROTO L1330: only a live, priced quote at the best price gets the star —
  // an accepted quote (rfq no longer live) never does.
  const best = live && q.state === "priced" && q.dealerId === bestDealerId;

  return {
    dealerId: q.dealerId,
    bank: dealer?.name ?? "",
    priceText: priceText(q),
    state: q.state,
    best,
    canAccept: live && q.state === "priced",
    house: q.dealerId === HOUSE_DEALER_ID,
  };
}

function priceText(q: Quote): string {
  if (q.state === "pending") {
    return "…";
  }

  if (q.state === "passed") {
    return "Passed";
  }

  return `$${(q.price ?? 0).toFixed(2)}`;
}

function stateLabel(state: RfqState): string {
  if (state === "Open") {
    return "LIVE";
  }

  if (state === "Closed") {
    return "ACCEPTED";
  }

  return state.toUpperCase();
}

function acceptedDealerName(r: Rfq, accepted: boolean): string {
  if (!accepted || r.acceptedDealerId == null) {
    return "";
  }

  const dealer = DEALERS.find((d) => {
    return d.id === r.acceptedDealerId;
  });

  return dealer?.name ?? "";
}
