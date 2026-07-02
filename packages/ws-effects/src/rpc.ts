import {
  catchError,
  from,
  isObservable,
  map,
  mergeMap,
  type Observable,
  of,
  take,
} from "rxjs";

import { matchType, out } from "./operators.js";
import type { Inbound, Outbound, WsEffect } from "./types.js";

function toObservable(
  value: Observable<unknown> | Promise<unknown> | unknown,
): Observable<unknown> {
  if (isObservable(value)) return value;
  if (value instanceof Promise) return from(value);
  const result: Observable<unknown> = of(value);
  return result;
}

/**
 * Sugar for a request/response effect. Runs `handle` per matching inbound,
 * takes its first emission as the result, and replies with an ack (or nack on
 * error), threading the request's correlationId. Absorbs the try/ack/catch/nack
 * boilerplate.
 *
 * Known simplification: if `handle`'s source completes without emitting, no
 * reply is sent (vs `firstValueFrom`, which would reject → nack). The server
 * simulators always emit for these RPCs, so this is not reachable in practice.
 */
export function rpc<Ctx>(
  inType: string,
  outType: string,
  handle: (
    payload: unknown,
    ctx: Ctx,
  ) => Observable<unknown> | Promise<unknown> | unknown,
): WsEffect<Ctx> {
  return (in$: Observable<Inbound>, ctx: Ctx): Observable<Outbound> => {
    return in$.pipe(
      matchType(inType),
      mergeMap((msg) => {
        return toObservable(handle(msg.payload, ctx)).pipe(
          take(1),
          map((result) => {
            return out(
              outType,
              { type: "ack", payload: result },
              msg.correlationId,
            );
          }),
          catchError(() => {
            return of(out(outType, { type: "nack" }, msg.correlationId));
          }),
        );
      }),
    );
  };
}
