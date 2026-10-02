import { type Observable, of } from "rxjs";

import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import { rpc, type WsEffect } from "@rtc/ws-effects";

import type { Ctx } from "./context.js";
import { isThroughputPayload, validated } from "./guards.js";

const getThroughput$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.GET_THROUGHPUT,
  SERVER_MSG.THROUGHPUT_RESPONSE,
  (_payload, ctx) => {
    return ctx.throughput.getThroughput();
  },
);

const setThroughput$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.SET_THROUGHPUT,
  SERVER_MSG.SET_THROUGHPUT_RESPONSE,
  (payload, ctx): Observable<undefined> => {
    return validated(
      CLIENT_MSG.SET_THROUGHPUT,
      payload,
      isThroughputPayload,
      ({ value }): Observable<undefined> => {
        ctx.throughput.setThroughput(value);
        return of(undefined);
      },
    );
  },
);

export const adminEffects: WsEffect<Ctx>[] = [getThroughput$, setThroughput$];
