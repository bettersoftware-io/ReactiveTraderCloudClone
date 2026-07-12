import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  filter,
  groupBy,
  mergeMap,
  type Observable,
  scan,
  switchMap,
} from "rxjs";

import type { Inbound, Outbound, WsEffect } from "./types.js";

interface KeyState {
  readonly count: number;
  readonly payload: unknown;
}

/**
 * Refcounted, keyed subscription effect — the correct shape for *idempotent*
 * live subscriptions (e.g. FX pricing by symbol).
 *
 * Where `stream()` starts a fresh inner per inbound (`mergeMap`), keyedStream
 * COALESCES frames that share a key: it tracks a per-key refcount, starts the
 * projected stream on the 0→1 transition, and tears it down only when a
 * matching `unsubType` frame brings the count back to 0. A duplicate `subType`
 * while a key is already live is a no-op (count++), so re-subscribing the same
 * key never spawns a second producer — the bug `stream()` would have here, and
 * the one that made FX ticks accelerate on every filter toggle (the client
 * re-subscribes a symbol it can't unsubscribe from, so the server used to merge
 * a fresh price interval each time).
 *
 * Keys are independent and each is error-isolated exactly like `stream()`: an
 * erroring inner logs and completes that one key without killing sibling keys
 * or the effect. `stream()` stays the right tool for one-shot / SoW fan-out.
 *
 * @param subType   inbound type that opens (or joins) a keyed subscription
 * @param unsubType inbound type that releases one subscriber of a key
 * @param keyOf     extracts the subscription key from a frame's payload
 * @param project   builds the outbound stream for a key (run once per 0→1 edge)
 */
export function keyedStream<Ctx>(
  subType: string,
  unsubType: string,
  keyOf: (payload: unknown) => string,
  project: (payload: unknown, ctx: Ctx) => Observable<Outbound>,
): WsEffect<Ctx> {
  return (in$: Observable<Inbound>, ctx: Ctx): Observable<Outbound> => {
    return in$.pipe(
      filter((msg) => {
        return msg.type === subType || msg.type === unsubType;
      }),
      groupBy((msg) => {
        return keyOf(msg.payload);
      }),
      mergeMap((group$) => {
        return group$.pipe(
          scan(
            (acc: KeyState, msg): KeyState => {
              const delta = msg.type === subType ? 1 : -1;
              return {
                // Clamp at 0 so a stray/duplicate unsubscribe can't drive the
                // count negative and later mask a genuine subscribe.
                count: Math.max(0, acc.count + delta),
                // Retain the latest subscribe payload to feed project().
                payload: msg.type === subType ? msg.payload : acc.payload,
              };
            },
            { count: 0, payload: undefined },
          ),
          distinctUntilChanged((a, b) => {
            return a.count > 0 === b.count > 0;
          }),
          switchMap(({ count, payload }) => {
            return count > 0
              ? project(payload, ctx).pipe(
                  catchError((err: unknown) => {
                    console.error("ws-effects: keyedStream effect error", err);
                    return EMPTY;
                  }),
                )
              : EMPTY;
          }),
        );
      }),
    );
  };
}
