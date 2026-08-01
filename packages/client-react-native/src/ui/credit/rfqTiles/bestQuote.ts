import { Direction, type Quote, type Rfq } from "@rtc/domain";

/** PROTO L1330: best = min price for a Buy, max price for a Sell — among
 * `pendingWithPrice` quotes only. Ported verbatim from the web client's
 * `rfqCardVm.ts` so both clients highlight the same row; a second derivation
 * would be a second place to get the Buy/Sell inversion backwards. */
export function findBestQuoteId(
  rfq: Rfq,
  quotes: readonly Quote[],
): number | null {
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

interface PricedQuoteId {
  id: number;
  price: number;
}
