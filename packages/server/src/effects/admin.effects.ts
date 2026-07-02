import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import { rpc, type WsEffect } from "@rtc/ws-effects";

import type { Ctx } from "./context.js";

interface ThroughputPayload {
  readonly value: number;
}

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
  (payload, ctx) => {
    const { value } = payload as ThroughputPayload;
    ctx.throughput.setThroughput(value);
    return undefined;
  },
);

export const adminEffects: WsEffect<Ctx>[] = [getThroughput$, setThroughput$];
