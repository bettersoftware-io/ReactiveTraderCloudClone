import type {
  Machine,
  RfqSubmissionIntents,
  RfqSubmissionState,
  RfqsPresenter,
  Stream,
  TicketSubmissionIntents,
  TicketSubmissionState,
} from "@rtc/core-api";
import { createShallowArrayMemo } from "@rtc/core-logic";
import {
  type CreateRfqInput,
  CreateRfqUseCase,
  createEmptyRfqStreamState,
  type Quote,
  type QuoteRequest,
  type Rfq,
  type RfqEvent,
  type RfqStreamState,
  reduceRfqEvent,
  type WorkflowPort,
} from "@rtc/domain";

import { once, relay, topicFromObservable } from "#/bridge/in";
import { promiseToStream, topicToStream } from "#/bridge/out";
import { relayTopic } from "#/kernel/relayTopic";
import { createTopic, type Topic } from "#/kernel/topic";
import { createRfqSubmissionMachine } from "#/machines/rfqSubmission";
import { createTicketSubmissionMachine } from "#/machines/ticketSubmission";

/** The last projected value, boxed so `null` reads as "nothing yet". */
interface Held<U> {
  readonly value: U;
}

/** A refCounted, replay-1 derivation of a topic that publishes only when
 * the projection's RESULT changes by reference — `map` +
 * `distinctUntilChanged` by reference. Paired with `createShallowArrayMemo`
 * it is `distinctUntilChanged(shallowArrayEquals)`, the RxJS core's
 * suppression for `rfqs$`/`quotesForRfq$`; paired with a field read it is
 * the reference check `allQuotes$` makes. */
function deriveDistinct<T, U>(
  source: Topic<T>,
  project: (value: T) => U,
): Topic<U> {
  return createTopic<U>(
    (signal, publish) => {
      let last: Held<U> | null = null;
      return relayTopic(source, signal, (value) => {
        const next = project(value);

        if (last !== null && Object.is(last.value, next)) {
          return;
        }

        last = { value: next };
        publish(next);
      });
    },
    { replay: true },
  );
}

/** The RFQ workflow: `workflow.events()` is called ONCE, here (ruling 6);
 * `events$` mirrors it retained, and `state` folds it with the domain
 * reducer from the domain seed — retained too, so a fresh `rfqs$`
 * subscriber replays the roster synchronously after every consumer left
 * (the RxJS `warmReplay()` over `state$`). `rfqs$`, `allQuotes$` and the
 * per-id `quotesForRfq$` are refCounted derivations that suppress
 * shallow-equal rosters (ruling 5). The five commands are `once` over the
 * port method, lazily, per call. */
export function createRfqsPresenter(
  workflow: WorkflowPort,
  lifetime: AbortSignal,
): RfqsPresenter {
  const source = workflow.events();
  const createUseCase = new CreateRfqUseCase(workflow);
  const events = topicFromObservable(source, lifetime);
  const state = createTopic<RfqStreamState>(
    (signal, publish) => {
      let current = createEmptyRfqStreamState();
      return relay(source, signal, (event: RfqEvent) => {
        current = reduceRfqEvent(current, event);
        publish(current);
      });
    },
    { replay: true, retainUntil: lifetime },
  );

  const rfqs = deriveDistinct(
    state,
    createShallowArrayMemo((s: RfqStreamState): readonly Rfq[] => {
      return Array.from(s.rfqs.values());
    }),
  );

  const allQuotes = deriveDistinct(state, (s: RfqStreamState) => {
    return s.quotes;
  });
  const quotesByRfq = new Map<number, Stream<readonly Quote[]>>();

  function createRfq(input: CreateRfqInput): Stream<number> {
    return promiseToStream((signal) => {
      return once(createUseCase.execute(input), signal);
    });
  }

  function quoteRfq(request: QuoteRequest): Stream<void> {
    return promiseToStream((signal) => {
      return once(workflow.quote(request), signal);
    });
  }

  function passQuote(quoteId: number): Stream<void> {
    return promiseToStream((signal) => {
      return once(workflow.pass(quoteId), signal);
    });
  }

  return {
    rfqs$: topicToStream(rfqs),
    allQuotes$: topicToStream(allQuotes),
    events$: topicToStream(events),
    quotesForRfq$: (rfqId: number) => {
      const cached = quotesByRfq.get(rfqId);

      if (cached !== undefined) {
        return cached;
      }

      const stream = topicToStream(
        deriveDistinct(
          state,
          createShallowArrayMemo((s: RfqStreamState): readonly Quote[] => {
            return Array.from(s.quotes.values()).filter((quote) => {
              return quote.rfqId === rfqId;
            });
          }),
        ),
      );
      quotesByRfq.set(rfqId, stream);
      return stream;
    },
    createRfq,
    acceptQuote: (quoteId: number) => {
      return promiseToStream((signal) => {
        return once(workflow.accept(quoteId), signal);
      });
    },
    cancelRfq: (rfqId: number) => {
      return promiseToStream((signal) => {
        return once(workflow.cancelRfq(rfqId), signal);
      });
    },
    passQuote,
    quoteRfq,
    createSubmission: (): Machine<RfqSubmissionState, RfqSubmissionIntents> => {
      return createRfqSubmissionMachine({ createRfq });
    },
    createTicketSubmission: (): Machine<
      TicketSubmissionState,
      TicketSubmissionIntents
    > => {
      return createTicketSubmissionMachine({ quoteRfq, passQuote });
    },
  };
}
