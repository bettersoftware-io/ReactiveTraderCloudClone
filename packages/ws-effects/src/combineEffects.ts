import { merge, type Observable } from "rxjs";

import type { Inbound, Outbound, WsEffect } from "./types.js";

/** Merge many effects into one, all sharing the same inbound stream. */
export function combineEffects<Ctx>(
  ...effects: WsEffect<Ctx>[]
): WsEffect<Ctx> {
  return (in$: Observable<Inbound>, ctx: Ctx): Observable<Outbound> => {
    return merge(
      ...effects.map((effect) => {
        return effect(in$, ctx);
      }),
    );
  };
}
