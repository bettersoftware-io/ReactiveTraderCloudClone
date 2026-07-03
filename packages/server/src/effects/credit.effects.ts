import { concat, from, map, mergeMap, type Observable, of } from "rxjs";

import type { Dealer, Instrument, RfqEvent } from "@rtc/domain";
import type {
  AcceptRequestDto,
  CancelRfqRequestDto,
  CreateRfqRequestDto,
  DealerDto,
  DealerEvent,
  InstrumentDto,
  InstrumentEvent,
  PassRequestDto,
  QuoteRequestDto,
  WorkflowEvent as WorkflowEventDto,
} from "@rtc/shared";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import {
  type Outbound,
  out,
  rpc,
  stream,
  type WsEffect,
} from "@rtc/ws-effects";

import type { Ctx } from "./context.js";

function transformWorkflowEvent(event: RfqEvent): WorkflowEventDto {
  switch (event.type) {
    case "startOfStateOfTheWorld":
    case "endOfStateOfTheWorld":
      return { type: event.type };
    case "rfqCreated":
    case "rfqClosed":
      return {
        type: event.type,
        payload: {
          id: event.payload.id,
          instrumentId: event.payload.instrumentId,
          quantity: event.payload.quantity,
          direction: event.payload.direction,
          state: event.payload.state,
          expirySecs: event.payload.expirySecs,
          creationTimestamp: event.payload.creationTimestamp,
        },
      };
    case "quoteCreated":
    case "quoteQuoted":
    case "quotePassed":
    case "quoteAccepted":
    case "quoteRejected":
      return {
        type: event.type,
        payload: {
          id: event.payload.id,
          rfqId: event.payload.rfqId,
          dealerId: event.payload.dealerId,
          state: event.payload.state,
        },
      };
  }
}

// instruments — SoW-marker fan-out: start → per-item added (once, on the
// first source emission, followed by end) → subsequent adds have no markers.
const instruments$: WsEffect<Ctx> = stream(
  CLIENT_MSG.SUBSCRIBE_INSTRUMENTS,
  (_payload, ctx) => {
    let isFirst = true;
    const start$ = of(
      out(SERVER_MSG.INSTRUMENT_EVENT, {
        type: "startOfStateOfTheWorld",
      } satisfies InstrumentEvent),
    );
    const events$: Observable<Outbound> = ctx.instruments.getInstruments().pipe(
      map((instruments: readonly Instrument[]): Outbound[] => {
        const added = instruments.map((inst): Outbound => {
          const dto: InstrumentDto = {
            id: inst.id,
            name: inst.name,
            cusip: inst.cusip,
            ticker: inst.ticker,
            maturity: inst.maturity,
            interestRate: inst.interestRate,
            benchmark: inst.benchmark,
            refPrice: inst.refPrice,
          };
          return out(SERVER_MSG.INSTRUMENT_EVENT, {
            type: "added",
            payload: dto,
          } satisfies InstrumentEvent);
        });
        const frames = isFirst
          ? [
              ...added,
              out(SERVER_MSG.INSTRUMENT_EVENT, {
                type: "endOfStateOfTheWorld",
              } satisfies InstrumentEvent),
            ]
          : added;
        isFirst = false;
        return frames;
      }),
      mergeMap((frames: Outbound[]) => {
        return from(frames);
      }),
    );
    return concat(start$, events$);
  },
);

// dealers — same SoW-marker fan-out shape as instruments$.
const dealers$: WsEffect<Ctx> = stream(
  CLIENT_MSG.SUBSCRIBE_DEALERS,
  (_payload, ctx) => {
    let isFirst = true;
    const start$ = of(
      out(SERVER_MSG.DEALER_EVENT, {
        type: "startOfStateOfTheWorld",
      } satisfies DealerEvent),
    );
    const events$: Observable<Outbound> = ctx.dealers.getDealers().pipe(
      map((dealers: readonly Dealer[]): Outbound[] => {
        const added = dealers.map((dealer): Outbound => {
          const dto: DealerDto = { id: dealer.id, name: dealer.name };
          return out(SERVER_MSG.DEALER_EVENT, {
            type: "added",
            payload: dto,
          } satisfies DealerEvent);
        });
        const frames = isFirst
          ? [
              ...added,
              out(SERVER_MSG.DEALER_EVENT, {
                type: "endOfStateOfTheWorld",
              } satisfies DealerEvent),
            ]
          : added;
        isFirst = false;
        return frames;
      }),
      mergeMap((frames: Outbound[]) => {
        return from(frames);
      }),
    );
    return concat(start$, events$);
  },
);

// workflow — 1:1 stream; each RfqEvent maps to one WorkflowEventDto frame.
const workflow$: WsEffect<Ctx> = stream(
  CLIENT_MSG.SUBSCRIBE_WORKFLOW,
  (_payload, ctx) => {
    return ctx.workflow.events().pipe(
      map((event: RfqEvent): Outbound => {
        return out(SERVER_MSG.WORKFLOW_EVENT, transformWorkflowEvent(event));
      }),
    );
  },
);

// createRfq — rpc; ack payload = the created rfqId.
const createRfq$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.CREATE_RFQ,
  SERVER_MSG.CREATE_RFQ_RESPONSE,
  (payload, ctx): Observable<number> => {
    const req = payload as CreateRfqRequestDto;
    return ctx.workflow.createRfq({
      instrumentId: req.instrumentId,
      dealerIds: [...req.dealerIds],
      quantity: req.quantity,
      direction: req.direction,
      expirySecs: req.expirySecs,
    });
  },
);

// cancelRfq — rpc; void ack.
const cancelRfq$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.CANCEL_RFQ,
  SERVER_MSG.CANCEL_RFQ_RESPONSE,
  (payload, ctx): Observable<void> => {
    const { rfqId } = payload as CancelRfqRequestDto;
    return ctx.workflow.cancelRfq(rfqId);
  },
);

// quote — rpc; void ack.
const quote$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.QUOTE,
  SERVER_MSG.QUOTE_RESPONSE,
  (payload, ctx): Observable<void> => {
    const req = payload as QuoteRequestDto;
    return ctx.workflow.quote(req);
  },
);

// pass — rpc; void ack.
const pass$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.PASS,
  SERVER_MSG.PASS_RESPONSE,
  (payload, ctx): Observable<void> => {
    const { quoteId } = payload as PassRequestDto;
    return ctx.workflow.pass(quoteId);
  },
);

// accept — rpc; void ack.
const accept$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.ACCEPT,
  SERVER_MSG.ACCEPT_RESPONSE,
  (payload, ctx): Observable<void> => {
    const { quoteId } = payload as AcceptRequestDto;
    return ctx.workflow.accept(quoteId);
  },
);

export const creditEffects: WsEffect<Ctx>[] = [
  instruments$,
  dealers$,
  workflow$,
  createRfq$,
  cancelRfq$,
  quote$,
  pass$,
  accept$,
];
