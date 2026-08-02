import { map, throttleTime } from "rxjs";

import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import { out, stream, type WsEffect } from "@rtc/ws-effects";

import type { Ctx } from "./context.js";

/**
 * Pushes `ctx.usageMeter.snapshot$` (a `BehaviorSubject` — subscribing
 * always replays the current snapshot first, so a late-attaching admin
 * panel isn't stuck waiting for the next `recordTurn`/`recordTokens` call)
 * to the requesting connection as `SERVER_MSG.ADMIN_JARVIS_USAGE`.
 *
 * `throttleTime(1_000, undefined, { leading: true, trailing: true })`:
 * `recordTokens` can fire many times a second during a busy Anthropic
 * streaming turn (once per SDK chunk), and the admin usage dock only needs
 * roughly-live numbers, not every intermediate accumulation — leading emits
 * the replayed/first snapshot immediately, trailing guarantees the final
 * value in a burst is never dropped.
 */
const jarvisUsage$: WsEffect<Ctx> = stream(
  CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE,
  (_payload, ctx) => {
    return ctx.usageMeter.snapshot$.pipe(
      throttleTime(1_000, undefined, { leading: true, trailing: true }),
      map((snapshot) => {
        return out(SERVER_MSG.ADMIN_JARVIS_USAGE, snapshot);
      }),
    );
  },
);

export const adminJarvisUsageEffects: WsEffect<Ctx>[] = [jarvisUsage$];
