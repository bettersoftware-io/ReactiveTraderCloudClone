import { type StateObservable, state } from "@rx-state/core";
import {
  concat,
  EMPTY,
  from,
  merge,
  Observable,
  of,
  type SchedulerLike,
  Subject,
  type Subscription,
  throwError,
  timer,
} from "rxjs";
import {
  catchError,
  concatMap,
  exhaustMap,
  ignoreElements,
  map,
  scan,
  take,
  takeUntil,
  tap,
  timeout,
} from "rxjs/operators";

import type {
  JarvisDemoIntents,
  JarvisDemoMachineHandle,
  JarvisDemoState,
  JarvisDemoStep,
  JarvisIntents,
} from "@rtc/core-api";
import {
  advanceDemoPatch,
  createDemoStepWatch,
  demoBeatMs,
  JARVIS_DEMO_INITIAL_STATE,
  JARVIS_DEMO_STEPS,
  lastEntryId,
} from "@rtc/core-logic";
import {
  DEMO_STEP_BEAT_MS,
  DEMO_STEP_TIMEOUT_MS,
  type PowerSaverLevel,
} from "@rtc/domain";

import type { JarvisEvent } from "#/adapters/jarvisPort";

import type { JarvisState } from "./JarvisMachine";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type {
  JarvisDemoIntents,
  JarvisDemoMachineHandle,
  JarvisDemoState,
  JarvisDemoStep,
};

export interface JarvisDemoDeps {
  readonly jarvisState$: Observable<JarvisState>;
  /** The SAME `events$` `JarvisMachineHandle` exposes — every turn's raw
   * reply events, expected to already carry the identical
   * `catchError(() => EMPTY)` guard `composition.ts` applies before handing
   * `jarvis.events$` to `createJarvisDriverMachine`/`createJarvisPanelsMachine`
   * (their own docs: that input is terminal on error). Needed ONLY to tell
   * a turn's `"error"` terminal apart from its `"done"` one:
   * `JarvisMachine.ts`'s own `eventPatch` sets `JarvisEntry.done = true`
   * IDENTICALLY for both cases (there is no separate error flag on
   * `JarvisEntry`), so `jarvisState$`'s `entries` alone cannot answer "did
   * this step's turn end in error?" — only the raw event's own
   * discriminated `type` can. See `runStep`'s doc for how a `jarvisEvents$`
   * emission is safely correlated to THIS machine's own in-flight turn
   * rather than a racing `narrate()` turn's. */
  readonly jarvisEvents$: Observable<JarvisEvent>;
  readonly jarvis: Pick<
    JarvisIntents,
    "open" | "close" | "sendScripted" | "declineConfirmation"
  >;
  readonly powerSaverLevel$: Observable<PowerSaverLevel>;
  /** Injected for ALL time in this machine (every `timer`) — a
   * `TestScheduler` in tests, `undefined` (rxjs's own `asyncScheduler`
   * default) in production. Mirrors `JarvisDriverDeps.scheduler`. */
  readonly scheduler?: SchedulerLike;
}

/** Moved to `./jarvisDemoScript` (pluggable-core slice 7 wave 2) —
 * re-exported so existing imports keep working. */
export { guideCommand, JARVIS_DEMO_STEPS } from "@rtc/core-logic";

/** Re-exported from `@rtc/domain` (`jarvis/jarvisConstants.ts`), where the
 * contract suites can read them (pluggable-core slice 7 wave 2). */
export { DEMO_STEP_BEAT_MS, DEMO_STEP_TIMEOUT_MS };

/** Reads a warm/replay-backed Observable's CURRENT value synchronously, or
 * `undefined` if nothing has emitted yet — same idiom as
 * `JarvisDriverMachine.ts`'s `readLatest`/composition.ts's
 * `readPreferenceNow` (not reused directly: both are private to their own
 * modules). Relies on `jarvisState$`/`powerSaverLevel$` being
 * warm/replay-backed by construction (`JarvisMachine`'s own `warm`
 * subscription; `PowerSaverPresenter.level$`'s `shareReplay`). */
function readLatest<T>(source$: Observable<T>): T | undefined {
  let value: T | undefined;
  const sub = source$.pipe(take(1)).subscribe((v) => {
    value = v;
  });
  sub.unsubscribe();
  return value;
}

interface StateWatchItem {
  readonly kind: "state";
  readonly state: JarvisState;
}

interface EventWatchItem {
  readonly kind: "event";
  readonly event: JarvisEvent;
}

type WatchItem = StateWatchItem | EventWatchItem;

/**
 * Drives ONE demo step's real Jarvis turn to completion and reports how it
 * ended (`"done"` or `"error"`): the RxJS shell over `createDemoStepWatch`
 * (`./jarvisDemoScript` — its doc carries the correlation rules). The
 * watcher (`merge` of both sources) is subscribed FIRST and
 * `sendScripted(step.command)` is called from inside that subscription's
 * setup, never the other way round: `jarvisEvents$` is a hot multicast with
 * no replay.
 *
 * **Watchdog.** The whole thing is wrapped in `timeout({ first:
 * DEMO_STEP_TIMEOUT_MS })`: if no settle arrives within that window (the
 * `sendScripted`-while-unavailable silent no-op is the real-world trigger —
 * see `DEMO_STEP_TIMEOUT_MS`'s doc), rxjs errors this observable with a
 * `TimeoutError`, which propagates out exactly like the `"error"` outcome
 * does downstream (`runStepPatches$`'s `catchError`-driven abort path).
 */
function runStep(
  step: JarvisDemoStep,
  deps: JarvisDemoDeps,
): Observable<"done" | "error"> {
  const watched$ = new Observable<"done" | "error">((subscriber) => {
    const watch = createDemoStepWatch(
      step,
      lastEntryId(readLatest(deps.jarvisState$)?.entries),
    );
    let declineTimerSub: Subscription | undefined;

    const watcher$: Observable<WatchItem> = merge(
      deps.jarvisState$.pipe(
        map((s): WatchItem => {
          return { kind: "state", state: s };
        }),
      ),
      deps.jarvisEvents$.pipe(
        map((e): WatchItem => {
          return { kind: "event", event: e };
        }),
      ),
    );

    const sub = watcher$.subscribe((item) => {
      if (item.kind === "state") {
        watch.observeState(item.state);
        return;
      }

      const signal = watch.observeEvent(item.event);

      if (signal === "decline") {
        const beat = demoBeatMs(readLatest(deps.powerSaverLevel$) ?? "off");

        declineTimerSub = timer(beat, deps.scheduler).subscribe(() => {
          deps.jarvis.declineConfirmation();
        });
        return;
      }

      if (signal !== null) {
        subscriber.next(signal);
        subscriber.complete();
      }
    });

    deps.jarvis.sendScripted(step.command);

    return () => {
      sub.unsubscribe();
      declineTimerSub?.unsubscribe();
    };
  });

  return watched$.pipe(
    timeout({ first: DEMO_STEP_TIMEOUT_MS, scheduler: deps.scheduler }),
  );
}

type Patch = (s: JarvisDemoState) => JarvisDemoState;

/** Tracks whether THIS machine's own run currently has the overlay closed
 * (step 7's `closesOverlay`) and not yet reopened — the one piece of mutable
 * state shared between the normal run pipeline (`advancePatch$`/
 * `openPatch$`/`finishPatch$`) and `stopDemo`'s own reopen guard (M1 fix):
 * `stopDemo` must reopen the overlay if THE DEMO is the one that closed it,
 * but must never force it back open just because a user separately closed it
 * by hand outside the demo — that's exactly what this flag distinguishes.
 * Lives for the machine's whole session (one instance, not per-run): every
 * exit path that calls `jarvis.open()` (`openPatch$` at the start of the
 * NEXT run, `finishPatch$` at the end of THIS one) also clears it, so a
 * fresh run always starts clean. */
interface OverlayCloseTracker {
  closedByDemo: boolean;
}

function openPatch$(
  deps: JarvisDemoDeps,
  tracker: OverlayCloseTracker,
): Observable<Patch> {
  return of(null).pipe(
    tap(() => {
      deps.jarvis.open();
      tracker.closedByDemo = false;
    }),
    map((): Patch => {
      return (s: JarvisDemoState): JarvisDemoState => {
        return { ...s, running: true };
      };
    }),
  );
}

function finishPatch$(
  deps: JarvisDemoDeps,
  tracker: OverlayCloseTracker,
): Observable<Patch> {
  return of(null).pipe(
    tap(() => {
      deps.jarvis.open();
      tracker.closedByDemo = false;
    }),
    map((): Patch => {
      return (): JarvisDemoState => {
        return JARVIS_DEMO_INITIAL_STATE;
      };
    }),
  );
}

function advancePatch$(
  step: JarvisDemoStep,
  index: number,
  deps: JarvisDemoDeps,
  tracker: OverlayCloseTracker,
): Observable<Patch> {
  return of(null).pipe(
    tap(() => {
      if (step.closesOverlay) {
        deps.jarvis.close();
        tracker.closedByDemo = true;
      }
    }),
    map((): Patch => {
      return advanceDemoPatch(step, index);
    }),
  );
}

const DEMO_ABORT_REASON = "JarvisDemoMachine: a step's turn ended in error";

/** One step's full lifecycle as a `Patch` stream: the immediate "now
 * running step N" advance (plus `jarvis.close()` for step 7), then
 * `runStep`'s real-turn wait, then the power-saver-aware post-settle beat
 * (spec §5: "After settle: delay(beat, scheduler)"). An `"error"` outcome
 * throws — no beat delay on the abort path, since there is nothing left to
 * pace into — so `runDemo$`'s `catchError` can short-circuit the remaining
 * `concatMap` steps straight to idle. */
function runStepPatches$(
  step: JarvisDemoStep,
  index: number,
  deps: JarvisDemoDeps,
  tracker: OverlayCloseTracker,
): Observable<Patch> {
  const settle$: Observable<Patch> = runStep(step, deps).pipe(
    concatMap((outcome) => {
      if (outcome === "error") {
        return throwError(() => {
          return new Error(DEMO_ABORT_REASON);
        });
      }

      const beat = demoBeatMs(readLatest(deps.powerSaverLevel$) ?? "off");
      return timer(beat, deps.scheduler).pipe(ignoreElements());
    }),
  );

  return concat(advancePatch$(step, index, deps, tracker), settle$);
}

/** One full demo run's `Patch` stream: `jarvis.open()`, all 7
 * `JARVIS_DEMO_STEPS` in order (`concatMap`, so step N+1 never starts
 * until step N's own turn has settled and paced its beat), then
 * `jarvis.open()` again + reset to idle. The `catchError` swallows a step's
 * abort throw — either an `"error"` outcome (`runStepPatches$`'s doc) OR a
 * `runStep` watchdog timeout (`DEMO_STEP_TIMEOUT_MS`'s doc; the SAME
 * `TimeoutError` just propagates through `settle$` unchanged, so no separate
 * handling is needed here) — so the SAME reopen-and-reset tail runs whether
 * the loop finished all 7 steps or aborted early for either reason —
 * `jarvis.open()` is idempotent while already open (`JarvisMachine`'s
 * `openPatches$` guard), so re-calling it here is always safe, never a
 * double "just opened" event. */
function runDemo$(
  deps: JarvisDemoDeps,
  tracker: OverlayCloseTracker,
): Observable<Patch> {
  const steps$: Observable<Patch> = from(JARVIS_DEMO_STEPS).pipe(
    concatMap((step, index) => {
      return runStepPatches$(step, index, deps, tracker);
    }),
    catchError(() => {
      return EMPTY;
    }),
  );

  return concat(openPatch$(deps, tracker), steps$, finishPatch$(deps, tracker));
}

/**
 * The hands-free scripted demo: a session-lifetime singleton (same
 * composition-root doctrine as `JarvisDriverMachine`/`JarvisPanelsMachine`
 * — built once, warm-subscribed for the app's whole session, no `dispose`)
 * that drives `JarvisMachine`'s REAL `sendScripted`/`declineConfirmation`
 * intents through the fixed `JARVIS_DEMO_STEPS` script, entirely over the
 * genuine turn pipeline — nothing here is faked or pre-recorded; every step
 * is a real scripted-brain turn, paced by the settle detection `runStep`
 * documents.
 *
 * `startDemo()` while already running is a no-op (`exhaustMap` ignores a
 * `start$` emission while the current run's inner `runDemo$` is still
 * active — the "single chain" guarantee: two concurrent runs could
 * interleave `sendScripted` calls onto the SAME turn queue, corrupting
 * both).
 *
 * `stopDemo()` interrupts the chain immediately: it declines any pending
 * confirmation card FIRST (directly, via a synchronous `jarvisState$` read
 * — never leave a dangling 60s-timeout card behind, regardless of whether
 * `runStep`'s own confirm→beat→decline sub-flow ever got the chance to run
 * its own decline), then reopens the overlay if THIS run is the one that
 * closed it (`overlayTracker.closedByDemo` — M1 fix: `takeUntil(stop$)`
 * cuts `runDemo$` before its own `finishPatch$` tail can run that reopen,
 * so `stopDemo` must do it directly, symmetric with the error/complete exit
 * paths), THEN signals `stop$`, which `takeUntil` uses to tear down the
 * in-flight step and a SEPARATE `stop$`-keyed patch resets state to idle.
 * The turn `sendScripted` already dispatched is left to finish naturally —
 * this machine has no way to cancel it (nor should it try: it's a
 * zero-cost, already-in-flight reply the user simply stops watching the
 * demo advance against).
 */
export function createJarvisDemoMachine(
  deps: JarvisDemoDeps,
): JarvisDemoMachineHandle {
  const start$ = new Subject<void>();
  const stop$ = new Subject<void>();
  const overlayTracker: OverlayCloseTracker = { closedByDemo: false };

  const runPatches$: Observable<Patch> = start$.pipe(
    exhaustMap(() => {
      return runDemo$(deps, overlayTracker).pipe(takeUntil(stop$));
    }),
  );

  const stopPatches$: Observable<Patch> = stop$.pipe(
    map((): Patch => {
      return (): JarvisDemoState => {
        return JARVIS_DEMO_INITIAL_STATE;
      };
    }),
  );

  const stream$ = merge(runPatches$, stopPatches$).pipe(
    scan((s, patch): JarvisDemoState => {
      return patch(s);
    }, JARVIS_DEMO_INITIAL_STATE),
  );

  const state$: StateObservable<JarvisDemoState> = state(
    stream$,
    JARVIS_DEMO_INITIAL_STATE,
  );

  // Keep state$ warm, same rationale as JarvisDriverMachine/JarvisPanelsMachine:
  // a cold state()/shareReplay stream with no live subscriber can drop a
  // step transition fired between one consumer unmounting and the next
  // mounting.
  state$.subscribe();

  return {
    state$,
    intents: {
      startDemo: () => {
        start$.next();
      },
      stopDemo: () => {
        const current = readLatest(deps.jarvisState$);

        if (current?.pendingConfirmation) {
          deps.jarvis.declineConfirmation();
        }

        // M1: reopen the overlay if THIS run is the one that closed it —
        // see overlayTracker's doc for why this must be a tracked flag
        // rather than an unconditional open() (a user's own manual close
        // must never be force-reopened by a stop).
        if (overlayTracker.closedByDemo) {
          deps.jarvis.open();
          overlayTracker.closedByDemo = false;
        }

        stop$.next();
      },
    },
  };
}
