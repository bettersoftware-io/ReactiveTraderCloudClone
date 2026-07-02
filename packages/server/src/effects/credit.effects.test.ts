import { of, Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import type { Inbound, Outbound, Socket } from "@rtc/ws-effects";
import { combineEffects, createWsListener } from "@rtc/ws-effects";

import type { Ctx } from "./context.js";
import { creditEffects } from "./credit.effects.js";

describe("credit effects", () => {
  it("streams instruments as SoW-marker fan-out: start, added, end", () => {
    const instrument = {
      id: 1,
      name: "ORCL 4.755 08/15/2026",
      cusip: "68389X105",
      ticker: "ORCL",
      maturity: "20260815",
      interestRate: 4.755,
      benchmark: "5Y UST 1.500 08/2026",
    };
    const ctx = {
      instruments: {
        getInstruments: vi.fn(() => {
          return of([instrument]);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({ type: CLIENT_MSG.SUBSCRIBE_INSTRUMENTS, payload: {} });
    expect(sent.map(payloadType)).toEqual([
      "startOfStateOfTheWorld",
      "added",
      "endOfStateOfTheWorld",
    ]);
    expect(
      sent.every((m) => {
        return m.type === SERVER_MSG.INSTRUMENT_EVENT;
      }),
    ).toBe(true);
    expect(sent[1]?.payload).toEqual({ type: "added", payload: instrument });
  });

  it("only emits end-of-SoW once, on the first source emission", () => {
    const instrument = {
      id: 1,
      name: "ORCL 4.755 08/15/2026",
      cusip: "68389X105",
      ticker: "ORCL",
      maturity: "20260815",
      interestRate: 4.755,
      benchmark: "5Y UST 1.500 08/2026",
    };
    const ctx = {
      instruments: {
        getInstruments: vi.fn(() => {
          return of([instrument], [instrument]);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({ type: CLIENT_MSG.SUBSCRIBE_INSTRUMENTS, payload: {} });
    expect(sent.map(payloadType)).toEqual([
      "startOfStateOfTheWorld",
      "added",
      "endOfStateOfTheWorld",
      "added",
    ]);
  });

  it("streams dealers as SoW-marker fan-out: start, added, end", () => {
    const dealer = { id: 0, name: "J.P. Morgan" };
    const ctx = {
      dealers: {
        getDealers: vi.fn(() => {
          return of([dealer]);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({ type: CLIENT_MSG.SUBSCRIBE_DEALERS, payload: {} });
    expect(sent.map(payloadType)).toEqual([
      "startOfStateOfTheWorld",
      "added",
      "endOfStateOfTheWorld",
    ]);
    expect(
      sent.every((m) => {
        return m.type === SERVER_MSG.DEALER_EVENT;
      }),
    ).toBe(true);
    expect(sent[1]?.payload).toEqual({ type: "added", payload: dealer });
  });

  it("maps a rfqCreated RfqEvent to the corresponding WorkflowEventDto", () => {
    const rfq = {
      id: 1,
      instrumentId: 0,
      quantity: 1_000_000,
      direction: "Buy",
      state: "Open",
      expirySecs: 120,
      creationTimestamp: 1,
    };
    const ctx = {
      workflow: {
        events: vi.fn(() => {
          return of({ type: "rfqCreated", payload: rfq });
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({ type: CLIENT_MSG.SUBSCRIBE_WORKFLOW, payload: {} });
    expect(sent).toEqual([
      {
        type: SERVER_MSG.WORKFLOW_EVENT,
        payload: { type: "rfqCreated", payload: rfq },
      },
    ]);
  });

  it("maps a quoteQuoted RfqEvent to the corresponding WorkflowEventDto", () => {
    const quote = {
      id: 1,
      rfqId: 1,
      dealerId: 0,
      state: { type: "pendingWithPrice", price: 101 },
    };
    const ctx = {
      workflow: {
        events: vi.fn(() => {
          return of({ type: "quoteQuoted", payload: quote });
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({ type: CLIENT_MSG.SUBSCRIBE_WORKFLOW, payload: {} });
    expect(sent).toEqual([
      {
        type: SERVER_MSG.WORKFLOW_EVENT,
        payload: { type: "quoteQuoted", payload: quote },
      },
    ]);
  });

  it("acks createRfq with the created rfqId", () => {
    const ctx = {
      workflow: {
        createRfq: vi.fn(() => {
          return of(7);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({
      type: CLIENT_MSG.CREATE_RFQ,
      payload: {
        instrumentId: 0,
        dealerIds: [0, 1],
        quantity: 1_000_000,
        direction: "Buy",
        expirySecs: 120,
      },
      correlationId: "1",
    });
    expect(sent).toEqual([
      {
        type: SERVER_MSG.CREATE_RFQ_RESPONSE,
        payload: { type: "ack", payload: 7 },
        correlationId: "1",
      },
    ]);
    expect(ctx.workflow.createRfq).toHaveBeenCalledWith({
      instrumentId: 0,
      dealerIds: [0, 1],
      quantity: 1_000_000,
      direction: "Buy",
      expirySecs: 120,
    });
  });

  it("acks cancelRfq", () => {
    const ctx = {
      workflow: {
        cancelRfq: vi.fn(() => {
          return of(undefined);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({
      type: CLIENT_MSG.CANCEL_RFQ,
      payload: { rfqId: 7 },
      correlationId: "2",
    });
    expect(sent).toEqual([
      {
        type: SERVER_MSG.CANCEL_RFQ_RESPONSE,
        payload: { type: "ack" },
        correlationId: "2",
      },
    ]);
    expect(ctx.workflow.cancelRfq).toHaveBeenCalledWith(7);
  });

  it("acks quote", () => {
    const ctx = {
      workflow: {
        quote: vi.fn(() => {
          return of(undefined);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({
      type: CLIENT_MSG.QUOTE,
      payload: { quoteId: 3, price: 101 },
      correlationId: "3",
    });
    expect(sent).toEqual([
      {
        type: SERVER_MSG.QUOTE_RESPONSE,
        payload: { type: "ack" },
        correlationId: "3",
      },
    ]);
    expect(ctx.workflow.quote).toHaveBeenCalledWith({
      quoteId: 3,
      price: 101,
    });
  });

  it("acks pass", () => {
    const ctx = {
      workflow: {
        pass: vi.fn(() => {
          return of(undefined);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({
      type: CLIENT_MSG.PASS,
      payload: { quoteId: 3 },
      correlationId: "4",
    });
    expect(sent).toEqual([
      {
        type: SERVER_MSG.PASS_RESPONSE,
        payload: { type: "ack" },
        correlationId: "4",
      },
    ]);
    expect(ctx.workflow.pass).toHaveBeenCalledWith(3);
  });

  it("acks accept", () => {
    const ctx = {
      workflow: {
        accept: vi.fn(() => {
          return of(undefined);
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({
      type: CLIENT_MSG.ACCEPT,
      payload: { quoteId: 3 },
      correlationId: "5",
    });
    expect(sent).toEqual([
      {
        type: SERVER_MSG.ACCEPT_RESPONSE,
        payload: { type: "ack" },
        correlationId: "5",
      },
    ]);
    expect(ctx.workflow.accept).toHaveBeenCalledWith(3);
  });
});

interface TypedPayload {
  readonly type: string;
}

function payloadType(m: Outbound): string {
  return (m.payload as TypedPayload).type;
}

interface Harness {
  readonly messages$: Subject<Inbound>;
  readonly sent: Outbound[];
}

function harness(ctx: Partial<Ctx>): Harness {
  const messages$ = new Subject<Inbound>();
  const closed$ = new Subject<void>();
  const sent: Outbound[] = [];
  const socket: Socket = {
    messages$,
    closed$,
    send: (m: Outbound) => {
      sent.push(m);
    },
  };
  createWsListener(combineEffects(...creditEffects), ctx as Ctx)(socket);
  return { messages$, sent };
}
