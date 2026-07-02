import { catchError, EMPTY, merge, type Observable } from "rxjs";

import type { Inbound, Outbound, WsEffect } from "./types.js";

/**
 * Merge many effects into one, all sharing the same inbound stream. Each
 * effect is error-isolated: if one errors at its outer level (e.g. an
 * rpc/raw effect, or anything not already caught inside `stream`), it logs
 * and completes without taking down its siblings in the merge. Belt-and-
 * suspenders with `stream`'s own per-inner-stream isolation.
 */
export function combineEffects<Ctx>(
  ...effects: WsEffect<Ctx>[]
): WsEffect<Ctx> {
  return (in$: Observable<Inbound>, ctx: Ctx): Observable<Outbound> => {
    return merge(
      ...effects.map((effect) => {
        return effect(in$, ctx).pipe(
          catchError((err: unknown) => {
            console.error("ws-effects: effect error (isolated)", err);
            return EMPTY;
          }),
        );
      }),
    );
  };
}
