import {
  ADAPTIVE_BANK_NAME,
  type Dealer,
  Direction,
  type Instrument,
  type Quote,
  type QuoteState,
  type Rfq,
  RfqState,
} from "@rtc/domain";

/** The dealer-quote row's display state — a flattened view of QuoteState's
 * six-way union for CSS/data-state purposes (PROTO Rfqs/QuoteRow.module.css:
 * pending/priced/passed/accepted; the two real-domain `rejected*` variants
 * fold into "rejected", which PROTO's simpler QuoteState never had). */
type QuoteDisplayState =
  | "pending"
  | "priced"
  | "passed"
  | "accepted"
  | "rejected";

export interface QuoteVm {
  readonly quoteId: number;
  readonly dealerId: number;
  readonly bank: string;
  readonly priceText: string;
  readonly state: QuoteDisplayState;
  /** Best live price for this RFQ's direction (PROTO L1330: min for Buy, max
   * for Sell), among `pendingWithPrice` quotes only, and only while live. */
  readonly best: boolean;
  /** ACCEPT is offered only for a `pendingWithPrice` quote on a live (Open) RFQ. */
  readonly canAccept: boolean;
  /** Adaptive Bank is the house dealer (PROTO L757). */
  readonly house: boolean;
}

export interface RfqCardVm {
  readonly rfqId: number;
  readonly direction: Direction;
  readonly ticker: string;
  readonly cusip: string;
  readonly qty: string;
  readonly stateLabel: string;
  /** The card's data-state: live (Open) / accepted (Closed) / terminated
   * (Cancelled or Expired). */
  readonly cardState: "live" | "accepted" | "terminated";
  readonly quotes: readonly QuoteVm[];
  readonly live: boolean;
  readonly accepted: boolean;
  readonly terminated: boolean;
  /** The dealer name the RFQ traded with, once Closed; "" otherwise. */
  readonly acceptedDealer: string;
}

/**
 * The streaming-quote card view model (PROTO Rfqs/rfqCardVm.ts, adapted to
 * the real domain's Rfq/Quote/QuoteState shapes). Pure and clock-free: RFQ
 * lifecycle (Open/Closed/Cancelled/Expired) is entirely server-driven
 * (CreditRfqSimulator) — the countdown display is a separate concern
 * (useRfqCountdown), not derived here.
 */
export function rfqCardVm(
  rfq: Rfq,
  quotes: readonly Quote[],
  instruments: readonly Instrument[],
  dealers: readonly Dealer[],
): RfqCardVm {
  const instrument = instruments.find((i) => {
    return i.id === rfq.instrumentId;
  });
  const live = rfq.state === RfqState.Open;
  const accepted = rfq.state === RfqState.Closed;
  const terminated =
    rfq.state === RfqState.Cancelled || rfq.state === RfqState.Expired;
  const bestQuoteId = live ? findBestQuoteId(rfq, quotes) : null;

  return {
    rfqId: rfq.id,
    direction: rfq.direction,
    ticker: instrument?.ticker ?? "",
    cusip: instrument?.cusip ?? "",
    // Pinned locale (PROTO creditData.ts fmtNum): host-locale-independent so
    // tests/snapshots don't vary with the running machine's locale.
    qty: rfq.quantity.toLocaleString("en-US"),
    stateLabel: stateLabel(rfq.state),
    cardState: cardState(live, accepted),
    quotes: quotes.map((q) => {
      return quoteVm(q, live, bestQuoteId, dealers);
    }),
    live,
    accepted,
    terminated,
    acceptedDealer: acceptedDealerName(quotes, dealers, accepted),
  };
}

function cardState(
  live: boolean,
  accepted: boolean,
): "live" | "accepted" | "terminated" {
  if (live) {
    return "live";
  }

  if (accepted) {
    return "accepted";
  }

  return "terminated";
}

interface PricedQuoteId {
  id: number;
  price: number;
}

/** PROTO L1330: best = min price for a Buy, max price for a Sell — among
 * `pendingWithPrice` quotes only. */
function findBestQuoteId(rfq: Rfq, quotes: readonly Quote[]): number | null {
  let best: PricedQuoteId | null = null;

  for (const q of quotes) {
    if (q.state.type !== "pendingWithPrice") {
      continue;
    }

    const price = q.state.price;

    if (best === null) {
      best = { id: q.id, price };
      continue;
    }

    const wins =
      rfq.direction === Direction.Buy ? price < best.price : price > best.price;

    if (wins) {
      best = { id: q.id, price };
    }
  }

  return best?.id ?? null;
}

function quoteVm(
  q: Quote,
  live: boolean,
  bestQuoteId: number | null,
  dealers: readonly Dealer[],
): QuoteVm {
  const dealer = dealers.find((d) => {
    return d.id === q.dealerId;
  });

  return {
    quoteId: q.id,
    dealerId: q.dealerId,
    bank: dealer?.name ?? "",
    priceText: priceText(q.state),
    state: displayState(q.state.type),
    best: live && q.state.type === "pendingWithPrice" && q.id === bestQuoteId,
    canAccept: live && q.state.type === "pendingWithPrice",
    house: dealer?.name === ADAPTIVE_BANK_NAME,
  };
}

function displayState(type: QuoteState["type"]): QuoteDisplayState {
  switch (type) {
    case "pendingWithoutPrice":
      return "pending";
    case "pendingWithPrice":
      return "priced";
    case "passed":
      return "passed";
    case "accepted":
      return "accepted";
    case "rejectedWithPrice":
    case "rejectedWithoutPrice":
      return "rejected";
  }
}

function priceText(state: QuoteState): string {
  switch (state.type) {
    case "pendingWithoutPrice":
      return "…";
    case "passed":
      return "Passed";
    case "rejectedWithoutPrice":
    case "rejectedWithPrice":
      return "Rejected";
    case "pendingWithPrice":
    case "accepted":
      return `$${state.price.toFixed(2)}`;
  }
}

function stateLabel(state: RfqState): string {
  switch (state) {
    case RfqState.Open:
      return "LIVE";
    case RfqState.Closed:
      return "ACCEPTED";
    case RfqState.Cancelled:
      return "CANCELLED";
    case RfqState.Expired:
      return "EXPIRED";
  }
}

function acceptedDealerName(
  quotes: readonly Quote[],
  dealers: readonly Dealer[],
  accepted: boolean,
): string {
  if (!accepted) {
    return "";
  }

  const acceptedQuote = quotes.find((q) => {
    return q.state.type === "accepted";
  });

  if (!acceptedQuote) {
    return "";
  }

  const dealer = dealers.find((d) => {
    return d.id === acceptedQuote.dealerId;
  });
  return dealer?.name ?? "";
}
