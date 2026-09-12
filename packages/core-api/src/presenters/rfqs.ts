import type {
  CreateRfqInput,
  Quote,
  QuoteRequest,
  Rfq,
  RfqEvent,
} from "@rtc/domain";

import type { Machine } from "#/machine";
import type {
  RfqSubmissionIntents,
  RfqSubmissionState,
  TicketSubmissionIntents,
  TicketSubmissionState,
} from "#/machines/submissions";
import type { Stream } from "#/stream";

export interface RfqsPresenter {
  readonly rfqs$: Stream<readonly Rfq[]>;
  readonly allQuotes$: Stream<ReadonlyMap<number, Quote>>;
  /** Raw RfqEvent stream — a second subscription to the workflow port for the
   * AnimationDirector (expiry/fill intents). The start-of-world snapshot
   * contains only rfqCreated/quoteCreated, so no spurious animation intents
   * fire on connect. */
  readonly events$: Stream<RfqEvent>;
  quotesForRfq$(rfqId: number): Stream<readonly Quote[]>;
  createRfq(input: CreateRfqInput): Stream<number>;
  acceptQuote(quoteId: number): Stream<void>;
  cancelRfq(rfqId: number): Stream<void>;
  passQuote(quoteId: number): Stream<void>;
  quoteRfq(request: QuoteRequest): Stream<void>;
  /** Per-mount machine for NewRfqForm's create→confirm→redirect flow. */
  createSubmission(): Machine<RfqSubmissionState, RfqSubmissionIntents>;
  /** Per-mount machine for TradeTicket's submit-price / pass flow. */
  createTicketSubmission(): Machine<
    TicketSubmissionState,
    TicketSubmissionIntents
  >;
}
