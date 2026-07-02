import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import type { Inbound, Outbound, Socket } from "@rtc/ws-effects";
import { combineEffects, createWsListener } from "@rtc/ws-effects";

import { adminEffects } from "./admin.effects.js";
import type { Ctx } from "./context.js";

describe("admin effects", () => {
  it("acks getThroughput with the throughput value", () => {
    const ctx = {
      throughput: {
        getThroughput: vi.fn(() => {
          return 42;
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({
      type: CLIENT_MSG.GET_THROUGHPUT,
      payload: {},
      correlationId: "1",
    });
    expect(sent).toEqual([
      {
        type: SERVER_MSG.THROUGHPUT_RESPONSE,
        payload: { type: "ack", payload: 42 },
        correlationId: "1",
      },
    ]);
    expect(ctx.throughput.getThroughput).toHaveBeenCalled();
  });

  it("acks setThroughput after calling setThroughput", () => {
    const ctx = {
      throughput: {
        setThroughput: vi.fn(() => {
          // void
        }),
      },
    };
    const { messages$, sent } = harness(ctx as unknown as Partial<Ctx>);
    messages$.next({
      type: CLIENT_MSG.SET_THROUGHPUT,
      payload: { value: 100 },
      correlationId: "2",
    });
    expect(sent).toEqual([
      {
        type: SERVER_MSG.SET_THROUGHPUT_RESPONSE,
        payload: { type: "ack" },
        correlationId: "2",
      },
    ]);
    expect(ctx.throughput.setThroughput).toHaveBeenCalledWith(100);
  });
});

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
  createWsListener(combineEffects(...adminEffects), ctx as Ctx)(socket);
  return { messages$, sent };
}
