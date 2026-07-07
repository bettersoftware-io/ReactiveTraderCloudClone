import {
  type CreditTrade,
  type Dealer,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";

/** Derives the credit blotter's trade rows — one per closed RFQ with an
 * accepted quote, newest (highest trade id) first. Shared by the panel body
 * (CreditBlotter — filtered/sorted rows) and the head slot (CreditBlotterHead
 * — the unfiltered trade count), so it lives in its own vm module rather
 * than the component file (same split as rfqCardVm.ts). */
export function deriveCreditTrades(
  rfqs: readonly Rfq[],
  allQuotes: ReadonlyMap<number, Quote>,
  instruments: readonly Instrument[],
  dealers: readonly Dealer[],
): CreditTrade[] {
  const instrumentMap = new Map<number, Instrument>();

  for (const i of instruments) {
    instrumentMap.set(i.id, i);
  }

  const dealerMap = new Map<number, Dealer>();

  for (const d of dealers) {
    dealerMap.set(d.id, d);
  }

  const trades: CreditTrade[] = [];

  for (const rfq of rfqs) {
    if (rfq.state !== RfqState.Closed) continue;

    // Find the accepted quote
    for (const quote of allQuotes.values()) {
      if (quote.rfqId !== rfq.id || quote.state.type !== "accepted") continue;

      const instrument = instrumentMap.get(rfq.instrumentId);
      const dealer = dealerMap.get(quote.dealerId);

      trades.push({
        tradeId: rfq.id,
        status: "accepted",
        tradeDate: new Date(rfq.creationTimestamp).toISOString().slice(0, 10),
        direction: rfq.direction,
        counterParty: dealer?.name ?? `Dealer ${quote.dealerId}`,
        cusip: instrument?.cusip ?? "",
        security: instrument?.ticker ?? "",
        quantity: rfq.quantity,
        orderType: "AON",
        unitPrice: quote.state.price,
      });
      break;
    }
  }

  return trades.sort((a, b) => {
    return b.tradeId - a.tradeId;
  });
}
