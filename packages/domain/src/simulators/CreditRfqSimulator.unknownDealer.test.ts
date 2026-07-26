import { firstValueFrom } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defined } from "../__testUtils__/defined.js";
import type { RfqEvent } from "../ports/workflowPort.js";
import { CreditRfqSimulator } from "./CreditRfqSimulator.js";
import { DEALERS_CATALOG } from "./DealerSimulator.js";

// createRfq skips any requested dealerId it cannot resolve. This IS reachable
// from the public API — `dealerIds` is caller-supplied and nothing validates it
// against the catalogue first — so an unknown id must degrade to "no quote from
// that dealer" rather than throwing or, worse, creating a quote with a dangling
// dealerId that the sell-side view would later fail to render.

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CreditRfqSimulator with unresolvable dealer ids", () => {
  it("still creates the RFQ, quoting only the dealers it can resolve", async () => {
    vi.useFakeTimers();
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);
    const known = defined(DEALERS_CATALOG[0]).id;

    const { rfqId, quotes } = await createRfqWithDealers(sim, [known, 999_999]);

    expect(rfqId).toBeTypeOf("number");
    expect(
      quotes.map((quote) => {
        return quote.dealerId;
      }),
    ).toEqual([known]);

    sim.dispose();
  });

  it("creates an RFQ with no quotes when every dealer id is unknown", async () => {
    vi.useFakeTimers();
    const sim = new CreditRfqSimulator(DEALERS_CATALOG);

    const { rfqId, quotes } = await createRfqWithDealers(
      sim,
      [999_998, 999_999],
    );

    // The RFQ itself must still exist — the caller asked for one, and an empty
    // quote list is a legitimate (if useless) state, not an error.
    expect(rfqId).toBeTypeOf("number");
    expect(quotes).toEqual([]);

    sim.dispose();
  });
});

interface QuotedDealer {
  rfqId: number;
  dealerId: number;
}

interface CreatedRfq {
  rfqId: number;
  quotes: QuotedDealer[];
}

interface QuoteCreatedTag {
  type: "quoteCreated";
}

/** Narrows RfqEvent to its quoteCreated member, so the collector can read
 * `payload.dealerId` off a properly-typed event. */
type QuoteCreatedEvent = Extract<RfqEvent, QuoteCreatedTag>;

/** Creates an RFQ while collecting the quoteCreated events it emits for that
 * rfqId, so the caller can assert exactly which dealers were quoted. */
async function createRfqWithDealers(
  sim: CreditRfqSimulator,
  dealerIds: number[],
): Promise<CreatedRfq> {
  const seen: RfqEvent[] = [];
  const sub = sim.events().subscribe((event) => {
    return seen.push(event);
  });

  const rfqId = await firstValueFrom(
    sim.createRfq({
      instrumentId: 1,
      dealerIds,
      quantity: 1000,
      direction: "Buy" as never,
      expirySecs: 60,
    }),
  );

  await vi.advanceTimersByTimeAsync(0);
  sub.unsubscribe();

  const quotes = seen
    .filter((event) => {
      return event.type === "quoteCreated" && event.payload.rfqId === rfqId;
    })
    .map((event) => {
      const { payload } = event as QuoteCreatedEvent;

      return { rfqId: payload.rfqId, dealerId: payload.dealerId };
    });

  return { rfqId, quotes };
}
