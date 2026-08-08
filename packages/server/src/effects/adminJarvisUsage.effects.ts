import {
  map,
  merge,
  type Observable,
  skip,
  switchMap,
  take,
  throttleTime,
  withLatestFrom,
} from "rxjs";

import type { AdminJarvisUsagePayload, JarvisUsageSnapshot } from "@rtc/shared";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import { out, stream, type WsEffect } from "@rtc/ws-effects";

import type { JarvisGateState } from "../services/jarvisGate.js";
import { spentWindowUsd } from "../services/jarvisGate.js";
import type { Ctx } from "./context.js";

function buildPayload(
  ctx: Ctx,
  snapshot: JarvisUsageSnapshot,
  gate: JarvisGateState,
): AdminJarvisUsagePayload {
  const { budgetUsd, softRatio } = ctx.jarvisGate.config;

  return {
    ...snapshot,
    budgetUsd: budgetUsd === "off" ? null : budgetUsd,
    softBudgetUsd: budgetUsd === "off" ? null : budgetUsd * softRatio,
    spentWindowUsd: spentWindowUsd(snapshot),
    gateLevel: gate.level,
  };
}

/**
 * Pushes `ctx.usageMeter.snapshot$` (a `BehaviorSubject` — subscribing
 * always replays the current snapshot first, so a late-attaching admin
 * panel isn't stuck waiting for the next `recordTurn`/`recordTokens` call)
 * enriched with the budget-gate envelope (`ctx.jarvisGate`) to the
 * requesting connection as `SERVER_MSG.ADMIN_JARVIS_USAGE`.
 *
 * Two legs, `merge`d, each building the payload through the same
 * `buildPayload` helper so every emission pairs a snapshot with the gate
 * level judged from THAT snapshot (never a stale one):
 *
 * - `routine$`: `snapshot$` throttled exactly as before —
 *   `throttleTime(1_000, undefined, { leading: true, trailing: true })`,
 *   since `recordTokens` can fire many times a second during a busy
 *   Anthropic streaming turn and the admin dock only needs roughly-live
 *   numbers — paired with `withLatestFrom(ctx.jarvisGate.state$)`, the gate
 *   level current at the moment THIS (possibly throttled/delayed) snapshot
 *   fires.
 * - `transitions$`: `ctx.jarvisGate.state$` unthrottled, so a gate flip
 *   surfaces immediately rather than waiting out `routine$`'s throttle
 *   window. `skip(1)` drops the state `BehaviorSubject`'s own
 *   replay-on-subscribe emission — `routine$`'s leading emission already
 *   carries the correct initial pairing, so replaying it a second time here
 *   would double the frame sent to a freshly-subscribing socket. Each real
 *   transition then PULLS the snapshot fresh via `switchMap(take(1))`
 *   rather than caching a parallel subscription's pushed value (e.g.
 *   `withLatestFrom(snapshot$)`): `ctx.jarvisGate` derives its state
 *   synchronously and reentrantly from the SAME `snapshot$` this effect
 *   also observes, and that reentrant `state$` emission fires nested
 *   inside `snapshot$`'s own notification to ITS subscribers —
 *   `JarvisGateService` subscribes at service-construction time, earlier
 *   than this per-connection effect, so a long-lived `withLatestFrom`
 *   cache here would still be holding the PRE-`recordTokens` value at that
 *   exact synchronous moment (proven by direct RxJS repro: a
 *   `withLatestFrom` cache trails one step behind, silently pairing a
 *   fresh gate level with a stale $0 spend). A fresh subscribe to a
 *   `BehaviorSubject` always reads its CURRENT value directly — a
 *   `BehaviorSubject.next()` updates its held value before notifying any
 *   observer, including reentrant ones — sidestepping that ordering race
 *   entirely.
 *
 * A gate flip immediately after a throttled `recordTokens` can therefore
 * emit `transitions$`'s fresh frame now and `routine$`'s trailing frame
 * later; both carry the same, correct pairing, so the bounded duplicate is
 * harmless. Per the Task 1 review ruling, `JarvisGateState.resetsAtMs` is
 * never read here — it retains the previous window's end while
 * `level === "none"`, so it cannot source a reset time for this payload;
 * the card's reset line already renders `snapshot.windowEndMs`.
 */
const jarvisUsage$: WsEffect<Ctx> = stream(
  CLIENT_MSG.ADMIN_JARVIS_USAGE_SUBSCRIBE,
  (_payload, ctx) => {
    const routine$ = ctx.usageMeter.snapshot$.pipe(
      throttleTime(1_000, undefined, { leading: true, trailing: true }),
      withLatestFrom(ctx.jarvisGate.state$),
      map(([snapshot, gate]) => {
        return buildPayload(ctx, snapshot, gate);
      }),
    );

    const transitions$: Observable<AdminJarvisUsagePayload> =
      ctx.jarvisGate.state$.pipe(
        skip(1),
        switchMap((gate) => {
          return ctx.usageMeter.snapshot$.pipe(
            take(1),
            map((snapshot) => {
              return buildPayload(ctx, snapshot, gate);
            }),
          );
        }),
      );

    return merge(routine$, transitions$).pipe(
      map((payload) => {
        return out(SERVER_MSG.ADMIN_JARVIS_USAGE, payload);
      }),
    );
  },
);

export const adminJarvisUsageEffects: WsEffect<Ctx>[] = [jarvisUsage$];
