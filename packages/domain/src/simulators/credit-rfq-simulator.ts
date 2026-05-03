import type { Direction } from "../fx/trade.js";
import type { Rfq } from "../credit/rfq.js";
import type { Quote, QuoteState } from "../credit/quote.js";
import type { WorkflowPort, RfqEvent, CreateRfqRequest, QuoteRequest } from "../ports/workflowPort.js";
import { RfqState } from "../credit/rfq.js";
import { ADAPTIVE_BANK_NAME } from "../credit/dealer.js";
import type { Dealer } from "../credit/dealer.js";

const PARTICIPATION_THRESHOLD = 0.3; // 70% chance of responding
const DEALER_RESPONSE_WINDOW_MS = 30_000;
const PRICE_BASELINE = 100;
const MAX_PRICE_CHANGE = 10;

type EventCallback = (event: RfqEvent) => void;

export class CreditRfqSimulator implements WorkflowPort {
  private nextRfqId = 1;
  private nextQuoteId = 1;
  private readonly rfqs = new Map<number, Rfq>();
  private readonly quotes = new Map<number, Quote>();
  private readonly rfqQuotes = new Map<number, number[]>(); // rfqId -> quoteIds
  private readonly dealers: readonly Dealer[];
  private readonly listeners: EventCallback[] = [];
  private readonly pendingTimeouts: ReturnType<typeof setTimeout>[] = [];

  constructor(dealers: readonly Dealer[]) {
    this.dealers = dealers;
  }

  private emit(event: RfqEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  async *subscribe(): AsyncIterable<RfqEvent> {
    // Yield initial SoW
    yield { type: "startOfStateOfTheWorld" };
    for (const rfq of this.rfqs.values()) {
      yield { type: "rfqCreated", payload: rfq };
      const quoteIds = this.rfqQuotes.get(rfq.id) ?? [];
      for (const qId of quoteIds) {
        const q = this.quotes.get(qId);
        if (q) yield { type: "quoteCreated", payload: q };
      }
    }
    yield { type: "endOfStateOfTheWorld" };

    // Then stream live events
    const queue: RfqEvent[] = [];
    let resolve: ((value: void) => void) | null = null;

    const listener = (event: RfqEvent) => {
      queue.push(event);
      if (resolve) {
        const r = resolve;
        resolve = null;
        r();
      }
    };
    this.listeners.push(listener);

    try {
      while (true) {
        if (queue.length === 0) {
          await new Promise<void>((r) => { resolve = r; });
        }
        while (queue.length > 0) {
          yield queue.shift()!;
        }
      }
    } finally {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    }
  }

  async createRfq(request: CreateRfqRequest): Promise<number> {
    const rfqId = this.nextRfqId++;
    const rfq: Rfq = {
      id: rfqId,
      instrumentId: request.instrumentId,
      quantity: request.quantity,
      direction: request.direction,
      state: RfqState.Open,
      expirySecs: request.expirySecs,
      creationTimestamp: Date.now(),
    };

    this.rfqs.set(rfqId, rfq);
    this.rfqQuotes.set(rfqId, []);
    this.emit({ type: "rfqCreated", payload: rfq });

    // Create quotes for each selected dealer
    for (const dealerId of request.dealerIds) {
      const dealer = this.dealers.find((d) => d.id === dealerId);
      if (!dealer) continue;

      const quoteId = this.nextQuoteId++;
      const quote: Quote = {
        id: quoteId,
        rfqId,
        dealerId,
        state: { type: "pendingWithoutPrice" },
      };

      this.quotes.set(quoteId, quote);
      this.rfqQuotes.get(rfqId)!.push(quoteId);
      this.emit({ type: "quoteCreated", payload: quote });

      // Schedule simulated dealer response (skip Adaptive Bank)
      if (dealer.name !== ADAPTIVE_BANK_NAME) {
        this.scheduleDealerResponse(rfqId, quoteId, dealer);
      }
    }

    return rfqId;
  }

  private scheduleDealerResponse(rfqId: number, quoteId: number, _dealer: Dealer): void {
    // 70% participation rate
    if (Math.random() <= PARTICIPATION_THRESHOLD) return;

    const responseDelay = Math.random() * DEALER_RESPONSE_WINDOW_MS;

    const timeout = setTimeout(async () => {
      try {
        const rfq = this.rfqs.get(rfqId);
        if (!rfq || rfq.state !== RfqState.Open) return;

        const priceChange = Math.floor(Math.random() * MAX_PRICE_CHANGE);
        const direction = Math.random() > 0.5 ? 1 : -1;
        const price = PRICE_BASELINE + priceChange * direction;

        await this.quote({ quoteId, price });
      } catch (e) {
        console.error("Error submitting simulated quote:", e);
      }
    }, responseDelay);

    this.pendingTimeouts.push(timeout);
  }

  async cancelRfq(rfqId: number): Promise<void> {
    const rfq = this.rfqs.get(rfqId);
    if (!rfq || rfq.state !== RfqState.Open) return;

    const updated: Rfq = { ...rfq, state: RfqState.Cancelled };
    this.rfqs.set(rfqId, updated);
    this.emit({ type: "rfqClosed", payload: updated });
  }

  async quote(request: QuoteRequest): Promise<void> {
    const quote = this.quotes.get(request.quoteId);
    if (!quote) return;

    const rfq = this.rfqs.get(quote.rfqId);
    if (!rfq || rfq.state !== RfqState.Open) return;

    const updated: Quote = {
      ...quote,
      state: { type: "pendingWithPrice", price: request.price },
    };
    this.quotes.set(request.quoteId, updated);
    this.emit({ type: "quoteQuoted", payload: updated });
  }

  async pass(quoteId: number): Promise<void> {
    const quote = this.quotes.get(quoteId);
    if (!quote) return;

    const updated: Quote = { ...quote, state: { type: "passed" } };
    this.quotes.set(quoteId, updated);
    this.emit({ type: "quotePassed", payload: updated });
  }

  async accept(quoteId: number): Promise<void> {
    const quote = this.quotes.get(quoteId);
    if (!quote || quote.state.type !== "pendingWithPrice") return;

    const price = quote.state.price;

    // Accept this quote
    const accepted: Quote = {
      ...quote,
      state: { type: "accepted", price },
    };
    this.quotes.set(quoteId, accepted);
    this.emit({ type: "quoteAccepted", payload: accepted });

    // Auto-reject all other pending quotes on same RFQ
    const quoteIds = this.rfqQuotes.get(quote.rfqId) ?? [];
    for (const otherId of quoteIds) {
      if (otherId === quoteId) continue;
      const other = this.quotes.get(otherId);
      if (!other) continue;

      let rejectedState: QuoteState | null = null;
      if (other.state.type === "pendingWithPrice") {
        rejectedState = { type: "rejectedWithPrice", price: other.state.price };
      } else if (other.state.type === "pendingWithoutPrice") {
        rejectedState = { type: "rejectedWithoutPrice" };
      }

      if (rejectedState) {
        const rejected: Quote = { ...other, state: rejectedState };
        this.quotes.set(otherId, rejected);
        // These are implicitly rejected, no separate event type — they come through as quote updates
      }
    }

    // Close the RFQ
    const rfq = this.rfqs.get(quote.rfqId);
    if (rfq) {
      const closed: Rfq = { ...rfq, state: RfqState.Closed };
      this.rfqs.set(quote.rfqId, closed);
      this.emit({ type: "rfqClosed", payload: closed });
    }
  }

  dispose(): void {
    for (const timeout of this.pendingTimeouts) {
      clearTimeout(timeout);
    }
    this.pendingTimeouts.length = 0;
  }
}
