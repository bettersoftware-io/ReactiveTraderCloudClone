import {
  combineLatest,
  from,
  map,
  merge,
  type Observable,
  of,
  switchMap,
  throttleTime,
} from "rxjs";

import type { JarvisUsage, JarvisUsageSnapshot } from "@rtc/domain";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import { out, stream, type WsEffect } from "@rtc/ws-effects";

import { nextUtcMidnightMs } from "../services/jarvisBudget/utcDay.js";
import { readConnectionBudget } from "./connectionBudget.js";
import type { Ctx } from "./context.js";

const DAY_MS = 86_400_000;

/** The snapshot as of today. `UsageMeter` rolls its day only when a record
 * arrives, so after midnight with no turn yet its snapshot still holds
 * yesterday's rows: those belong to no day the card shows. */
function snapshotOfToday(
  snapshot: JarvisUsageSnapshot,
  nowMs: number,
): JarvisUsageSnapshot {
  if (snapshot.windowEndMs > nowMs) {
    return snapshot;
  }

  const windowEndMs = nextUtcMidnightMs(nowMs);

  return {
    ...snapshot,
    windowStartMs: windowEndMs - DAY_MS,
    windowEndMs,
    currentWindow: [],
  };
}

/** The Ops card's payload (spec §3.8): today's usage rows beside today's
 * house-wide spend against the house cap. The soft stage is retired, so
 * `softBudgetUsd` is always null and `gateLevel` is `"hard"` exactly when
 * the house spend has reached the cap. */
function buildPayload(ctx: Ctx, snapshot: JarvisUsageSnapshot): JarvisUsage {
  const house = ctx.jarvisBudget.houseToday();

  return {
    ...snapshotOfToday(snapshot, Date.now()),
    budgetUsd: house.limitUsd,
    softBudgetUsd: null,
    spentWindowUsd: house.spentUsd,
    gateLevel: house.spentUsd >= house.limitUsd ? "hard" : "none",
  };
}

/** Emits once the house copy is current, then again after every budget
 * change has been re-read. `houseToday()` answers from the budget service's
 * in-process copy, which only a `stateFor` fills from the store — after a
 * restart it reads $0 until someone's budget is read. So the subscribing
 * connection reads its own caller's budget first (every Ops subscriber is a
 * signed-in caller); a connection with no caller has nothing to read with,
 * and shows what the copy holds. */
function houseCopyReadings$(ctx: Ctx): Observable<void> {
  const caller = ctx.caller;

  if (caller === null) {
    return of(undefined);
  }

  return merge(of(undefined), ctx.jarvisBudget.changes$).pipe(
    switchMap((): Observable<void> => {
      return from(
        readConnectionBudget(ctx, caller).then((): undefined => {
          return undefined;
        }),
      );
    }),
  );
}

/**
 * Pushes the Jarvis usage card's payload to the requesting connection as
 * `SERVER_MSG.OPS_JARVIS_USAGE`: `ctx.usageMeter.snapshot$` (a
 * `BehaviorSubject` — subscribing always replays the current snapshot, so a
 * late-attaching ops panel isn't stuck waiting for the next record) beside
 * the house budget from `ctx.jarvisBudget`.
 *
 * Two inputs, `combineLatest`ed, each frame building the payload through the
 * same `buildPayload`:
 *
 * - the snapshot, throttled —
 *   `throttleTime(1_000, undefined, { leading: true, trailing: true })`,
 *   since a busy Anthropic turn records tokens several times a second and
 *   the ops dock only needs roughly-live rows;
 * - every reading of the house copy (`houseCopyReadings$`), unthrottled, so
 *   a spend, a store outage or the midnight reset reaches the card at once.
 *   The first frame waits for the first reading, so it never shows a $0
 *   house spend that is only an unread copy.
 *
 * The house figures are read when a frame is built, never cached with the
 * snapshot, so a frame's `spentWindowUsd` and `gateLevel` always agree with
 * each other. A frame pushed by a reading can carry rows up to one throttle
 * window old; the throttle's trailing frame brings them up to date.
 */
const jarvisUsage$: WsEffect<Ctx> = stream(
  CLIENT_MSG.OPS_JARVIS_USAGE_SUBSCRIBE,
  (_payload, ctx) => {
    const snapshots$ = ctx.usageMeter.snapshot$.pipe(
      throttleTime(1_000, undefined, { leading: true, trailing: true }),
    );

    return combineLatest([snapshots$, houseCopyReadings$(ctx)]).pipe(
      map(([snapshot]) => {
        return out(SERVER_MSG.OPS_JARVIS_USAGE, buildPayload(ctx, snapshot));
      }),
    );
  },
);

export const opsJarvisUsageEffects: WsEffect<Ctx>[] = [jarvisUsage$];
