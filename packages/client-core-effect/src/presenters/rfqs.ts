import { Effect, Option, Stream } from "effect";

import type {
  Stream as CoreStream,
  Machine,
  RfqSubmissionIntents,
  RfqSubmissionState,
  RfqsPresenter,
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
  type RfqStreamState,
  reduceRfqEvent,
  type WorkflowPort,
} from "@rtc/domain";

import {
  type EffectHost,
  type FoldUpdate,
  type FromPort,
  sharedFold,
  streamToStream,
} from "#/bridge/out";
import { rpc } from "#/bridge/rpc";
import { createRfqSubmissionMachine } from "#/machines/rfqSubmission";
import { createTicketSubmissionMachine } from "#/machines/ticketSubmission";
import { mirrorPort, mirrorPortAsIs } from "#/presenters/mirrorPort";

/** A one-shot command as a Stream: the port is called only when subscribed
 * (`Effect.suspend`), the value is emitted and the stream completes. */
function command<T>(
  host: EffectHost,
  call: () => CoreStream<T>,
): CoreStream<T> {
  return streamToStream(
    host,
    Stream.fromEffect(
      Effect.suspend(() => {
        return rpc(call());
      }),
    ),
  );
}

/** The RFQ workflow: `workflow.events()` is called ONCE, here (ruling 6).
 * `events$` mirrors it retained; `state$` is a RETAINED fold of it with the
 * domain reducer from the domain seed, so a fresh subscriber of any
 * derivation seeds synchronously from the current state after every
 * consumer left (the RxJS `warmReplay()` over `state$`). `rfqs$`,
 * `allQuotes$` and the per-id `quotesForRfq$` are refCounted `mirrorPort`s
 * over it: the `Object.is` guard drops what `createShallowArrayMemo` hands
 * back unchanged — `distinctUntilChanged(shallowArrayEquals)` (ruling 5) —
 * and the reference check `allQuotes$` makes. Each memo is built ONCE, per
 * derived stream, so it survives across warm periods and the `seed` and the
 * `run` projections share it. */
export function createRfqsPresenter(
  host: EffectHost,
  workflow: WorkflowPort,
): RfqsPresenter {
  const source = workflow.events();
  const createUseCase = new CreateRfqUseCase(workflow);
  const events$ = mirrorPortAsIs(host, source, { retain: true });
  const state$ = sharedFold<RfqStreamState>(host, {
    retain: true,
    seed: () => {
      return Option.none();
    },
    run: (update: FoldUpdate<RfqStreamState>, fromPort: FromPort) => {
      let current = createEmptyRfqStreamState();
      return fromPort(source).pipe(
        Stream.runForEach((event) => {
          current = reduceRfqEvent(current, event);
          const next = current;
          return update(() => {
            return next;
          });
        }),
      );
    },
  });
  const quotesByRfq = new Map<number, CoreStream<readonly Quote[]>>();

  function createRfq(input: CreateRfqInput): CoreStream<number> {
    return command(host, () => {
      return createUseCase.execute(input);
    });
  }

  function quoteRfq(request: QuoteRequest): CoreStream<void> {
    return command(host, () => {
      return workflow.quote(request);
    });
  }

  function passQuote(quoteId: number): CoreStream<void> {
    return command(host, () => {
      return workflow.pass(quoteId);
    });
  }

  return {
    rfqs$: mirrorPort(
      host,
      state$,
      createShallowArrayMemo((s: RfqStreamState): readonly Rfq[] => {
        return Array.from(s.rfqs.values());
      }),
    ),
    allQuotes$: mirrorPort(host, state$, (s: RfqStreamState) => {
      return s.quotes;
    }),
    events$,
    quotesForRfq$: (rfqId: number) => {
      const cached = quotesByRfq.get(rfqId);

      if (cached !== undefined) {
        return cached;
      }

      const stream = mirrorPort(
        host,
        state$,
        createShallowArrayMemo((s: RfqStreamState): readonly Quote[] => {
          return Array.from(s.quotes.values()).filter((quote) => {
            return quote.rfqId === rfqId;
          });
        }),
      );
      quotesByRfq.set(rfqId, stream);
      return stream;
    },
    createRfq,
    acceptQuote: (quoteId: number) => {
      return command(host, () => {
        return workflow.accept(quoteId);
      });
    },
    cancelRfq: (rfqId: number) => {
      return command(host, () => {
        return workflow.cancelRfq(rfqId);
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
