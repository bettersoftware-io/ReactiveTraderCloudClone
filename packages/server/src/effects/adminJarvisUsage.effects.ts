import { combineLatest, map, throttleTime } from "rxjs";

import type { AdminJarvisUsagePayload } from "@rtc/shared";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import { out, stream, type WsEffect } from "@rtc/ws-effects";

import { spentWindowUsd } from "../services/jarvisGate.js";
import type { Ctx } from "./context.js";

/**
 * Pushes `ctx.usageMeter.snapshot$` (a `BehaviorSubject` — subscribing
 * always replays the current snapshot first, so a late-attaching admin
 * panel isn't stuck waiting for the next `recordTurn`/`recordTokens` call)
 * enriched with the budget-gate envelope (`ctx.jarvisGate`) to the
 * requesting connection as `SERVER_MSG.ADMIN_JARVIS_USAGE`.
 *
 * `throttleTime(1_000, undefined, { leading: true, trailing: true })` sits
 * on the snapshot leg only: `recordTokens` can fire many times a second
 * during a busy Anthropic streaming turn (once per SDK chunk), and the
 * admin usage dock only needs roughly-live numbers, not every intermediate
 * accumulation — leading emits the replayed/first snapshot immediately,
 * trailing guarantees the final value in a burst is never dropped. Gate
 * transitions on `ctx.jarvisGate.state$` are rare and surface immediately,
 * unthrottled, via `combineLatest`. Per the Task 1 review ruling,
 * `JarvisGateState.resetsAtMs` is never read here — it retains the
 * previous window's end while `level === "none"`, so it cannot source a
 * reset time for this payload; the card's reset line already renders
 * `snapshot.windowEndMs`.
 */
const jarvisUsage$: WsEffect<Ctx> = stream(
  CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE,
  (_payload, ctx) => {
    return combineLatest([
      ctx.usageMeter.snapshot$.pipe(
        throttleTime(1_000, undefined, { leading: true, trailing: true }),
      ),
      ctx.jarvisGate.state$,
    ]).pipe(
      map(([snapshot, gate]) => {
        const { budgetUsd, softRatio } = ctx.jarvisGate.config;
        const payload: AdminJarvisUsagePayload = {
          ...snapshot,
          budgetUsd: budgetUsd === "off" ? null : budgetUsd,
          softBudgetUsd: budgetUsd === "off" ? null : budgetUsd * softRatio,
          spentWindowUsd: spentWindowUsd(snapshot),
          gateLevel: gate.level,
        };

        return out(SERVER_MSG.ADMIN_JARVIS_USAGE, payload);
      }),
    );
  },
);

export const adminJarvisUsageEffects: WsEffect<Ctx>[] = [jarvisUsage$];
