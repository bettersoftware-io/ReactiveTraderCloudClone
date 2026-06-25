import { concat, defer, from, type Observable, of, Subject } from "rxjs";

import type { Dealer } from "../credit/dealer.js";
import { ADAPTIVE_BANK_NAME } from "../credit/dealer.js";
import type { Quote, QuoteState } from "../credit/quote.js";
import type { Rfq } from "../credit/rfq.js";
import { RfqState } from "../credit/rfq.js";
import type {
  CreateRfqRequest,
  QuoteRequest,
  RfqEvent,
  WorkflowPort,
} from "../ports/workflowPort.js";

const PARTICIPATION_THRESHOLD = 0.3; // 70% chance of responding
const DEALER_RESPONSE_WINDOW_MS = 30_000;
const PRICE_BASELINE = 100;
const MAX_PRICE_CHANGE = 10;

export class CreditRfqSimulator implements WorkflowPort {
  private nextRfqId = 1;

  private nextQuoteId = 1;

  private readonly rfqs = new Map<number, Rfq>();

  private readonly quotes = new Map<number, Quote>();

  private readonly rfqQuotes = new Map<number, number[]>(); // rfqId -> quoteIds

  private readonly dealers: readonly Dealer[];

  private readonly events$ = new Subject<RfqEvent>();

  private readonly pendingTimeouts: ReturnType<typeof setTimeout>[] = [];

  constructor(dealers: readonly Dealer[]) {
    this.dealers = dealers;
  }

  events(): Observable<RfqEvent> {
    return defer(() => {
      const snapshot: RfqEvent[] = [];
      snapshot.push({ type: "startOfStateOfTheWorld" });

      for (const rfq of this.rfqs.values()) {
        snapshot.push({ type: "rfqCreated", payload: rfq });
        const quoteIds = this.rfqQuotes.get(rfq.id) ?? [];

        for (const qId of quoteIds) {
          const q = this.quotes.get(qId);
          if (q) snapshot.push({ type: "quoteCreated", payload: q });
        }
      }

      snapshot.push({ type: "endOfStateOfTheWorld" });
      return concat(from(snapshot), this.events$.asObservable());
    });
  }

  createRfq(request: CreateRfqRequest): Observable<number> {
    return defer(() => {
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
      this.events$.next({ type: "rfqCreated", payload: rfq });

      this.scheduleExpiry(rfqId, request.expirySecs);

      // Create quotes for each selected dealer
      for (const dealerId of request.dealerIds) {
        const dealer = this.dealers.find((d) => {
          return d.id === dealerId;
        });
        if (!dealer) continue;

        const quoteId = this.nextQuoteId++;
        const quote: Quote = {
          id: quoteId,
          rfqId,
          dealerId,
          state: { type: "pendingWithoutPrice" },
        };

        this.quotes.set(quoteId, quote);
        const rfqQuoteList = this.rfqQuotes.get(rfqId);
        if (!rfqQuoteList)
          throw new Error(`Internal: no quote list for rfqId ${rfqId}`);
        rfqQuoteList.push(quoteId);
        this.events$.next({ type: "quoteCreated", payload: quote });

        // Schedule simulated dealer response (skip Adaptive Bank)
        if (dealer.name !== ADAPTIVE_BANK_NAME) {
          this.scheduleDealerResponse(rfqId, quoteId, dealer);
        }
      }

      return of(rfqId);
    });
  }

  private scheduleExpiry(rfqId: number, expirySecs: number): void {
    const timeout = setTimeout(() => {
      const rfq = this.rfqs.get(rfqId);
      if (!rfq || rfq.state !== RfqState.Open) return;
      const expired: Rfq = { ...rfq, state: RfqState.Expired };
      this.rfqs.set(rfqId, expired);
      this.events$.next({ type: "rfqClosed", payload: expired });
    }, expirySecs * 1000);
    this.pendingTimeouts.push(timeout);
  }

  private scheduleDealerResponse(
    rfqId: number,
    quoteId: number,
    _dealer: Dealer,
  ): void {
    // 70% participation rate
    if (Math.random() <= PARTICIPATION_THRESHOLD) return;

    const responseDelay = Math.random() * DEALER_RESPONSE_WINDOW_MS;

    const timeout = setTimeout(() => {
      try {
        const rfq = this.rfqs.get(rfqId);
        if (!rfq || rfq.state !== RfqState.Open) return;

        const priceChange = Math.floor(Math.random() * MAX_PRICE_CHANGE);
        const direction = Math.random() > 0.5 ? 1 : -1;
        const price = PRICE_BASELINE + priceChange * direction;

        this.applyQuote({ quoteId, price });
      } catch (e) {
        console.error("Error submitting simulated quote:", e);
      }
    }, responseDelay);

    this.pendingTimeouts.push(timeout);
  }

  cancelRfq(rfqId: number): Observable<void> {
    return defer(() => {
      const rfq = this.rfqs.get(rfqId);
      if (!rfq || rfq.state !== RfqState.Open) return of(undefined);

      const updated: Rfq = { ...rfq, state: RfqState.Cancelled };
      this.rfqs.set(rfqId, updated);
      this.events$.next({ type: "rfqClosed", payload: updated });
      return of(undefined);
    });
  }

  quote(request: QuoteRequest): Observable<void> {
    return defer(() => {
      this.applyQuote(request);
      return of(undefined);
    });
  }

  private applyQuote(request: QuoteRequest): void {
    const quote = this.quotes.get(request.quoteId);
    if (!quote) return;

    const rfq = this.rfqs.get(quote.rfqId);
    if (!rfq || rfq.state !== RfqState.Open) return;

    const updated: Quote = {
      ...quote,
      state: { type: "pendingWithPrice", price: request.price },
    };
    this.quotes.set(request.quoteId, updated);
    this.events$.next({ type: "quoteQuoted", payload: updated });
  }

  pass(quoteId: number): Observable<void> {
    return defer(() => {
      const quote = this.quotes.get(quoteId);
      if (!quote) return of(undefined);

      const updated: Quote = { ...quote, state: { type: "passed" } };
      this.quotes.set(quoteId, updated);
      this.events$.next({ type: "quotePassed", payload: updated });
      return of(undefined);
    });
  }

  accept(quoteId: number): Observable<void> {
    return defer(() => {
      const quote = this.quotes.get(quoteId);
      if (quote?.state.type !== "pendingWithPrice") return of(undefined);

      const price = quote.state.price;

      // Accept this quote
      const accepted: Quote = {
        ...quote,
        state: { type: "accepted", price },
      };
      this.quotes.set(quoteId, accepted);
      this.events$.next({ type: "quoteAccepted", payload: accepted });

      // Auto-reject all other pending quotes on same RFQ
      const quoteIds = this.rfqQuotes.get(quote.rfqId) ?? [];

      for (const otherId of quoteIds) {
        if (otherId === quoteId) continue;
        const other = this.quotes.get(otherId);
        if (!other) continue;

        let rejectedState: QuoteState | null = null;

        if (other.state.type === "pendingWithPrice") {
          rejectedState = {
            type: "rejectedWithPrice",
            price: other.state.price,
          };
        } else if (other.state.type === "pendingWithoutPrice") {
          rejectedState = { type: "rejectedWithoutPrice" };
        }

        if (rejectedState) {
          const rejected: Quote = { ...other, state: rejectedState };
          this.quotes.set(otherId, rejected);
          // Surface the rejection live so competing cards flip immediately
          // (rtc-original getQuoteStateOnAccept, creditRfqs.ts:173-216). The simulator is the server here.
          this.events$.next({ type: "quoteRejected", payload: rejected });
        }
      }

      // Close the RFQ
      const rfq = this.rfqs.get(quote.rfqId);

      if (rfq) {
        const closed: Rfq = { ...rfq, state: RfqState.Closed };
        this.rfqs.set(quote.rfqId, closed);
        this.events$.next({ type: "rfqClosed", payload: closed });
      }

      return of(undefined);
    });
  }

  dispose(): void {
    for (const timeout of this.pendingTimeouts) {
      clearTimeout(timeout);
    }

    this.pendingTimeouts.length = 0;
  }
}
