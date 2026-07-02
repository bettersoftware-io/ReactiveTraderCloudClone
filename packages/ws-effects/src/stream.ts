import { catchError, EMPTY, mergeMap, type Observable } from "rxjs";

import { matchType } from "./operators.js";
import type { Inbound, Outbound, WsEffect } from "./types.js";

/**
 * Sugar for a subscription effect: on each matching inbound, subscribe the
 * projected observable and forward its outbound frames. `project` returns
 * `Outbound`s directly, so it covers 1→N streaming and SoW-marker fan-out.
 * Each projected inner stream is error-isolated: if it errors, that one
 * inner stream logs and completes without killing the effect or any other
 * matching inbound's inner stream (parity with the old per-subscription
 * imperative handler).
 */
export function stream<Ctx>(
  inType: string,
  project: (payload: unknown, ctx: Ctx) => Observable<Outbound>,
): WsEffect<Ctx> {
  return (in$: Observable<Inbound>, ctx: Ctx): Observable<Outbound> => {
    return in$.pipe(
      matchType(inType),
      mergeMap((msg) => {
        return project(msg.payload, ctx).pipe(
          catchError((err: unknown) => {
            console.error("ws-effects: stream effect error", err);
            return EMPTY;
          }),
        );
      }),
    );
  };
}
