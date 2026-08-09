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
} from "rxjs/operators";

import type { PowerSaverLevel } from "@rtc/domain";

import type { JarvisEvent } from "#/adapters/jarvisPort";

import type { JarvisEntry, JarvisIntents, JarvisState } from "./JarvisMachine";
import { JARVIS_GUIDE_CATALOG } from "./jarvisGuideCatalog";

/** How long the demo pauses between one step settling and the next step's
 * `sendScripted` — the visible "beat" that gives a viewer time to actually
 * read what just happened. Collapses to 0 under power-saver `"freeze"`
 * (read fresh per step from `powerSaverLevel$`, mirroring
 * `JarvisDriverMachine.DRIVE_STAGGER_MS`'s identical motion-free
 * guarantee — `docs/performance.md`/`docs/power-saver-mode.md`). */
export const DEMO_STEP_BEAT_MS = 1200;

export interface JarvisDemoStep {
  /** Rendered by `JarvisDemoState.label` while this step is in flight — a
   * short section-style tag, not necessarily the catalog section title
   * verbatim (see `JARVIS_DEMO_STEPS`'s own doc for why MARKET INTEL, e.g.,
   * covers two catalog rows under `DESK INTELLIGENCE`). */
  readonly label: string;
  /** The literal text sent via `sendScripted` — always resolved from
   * `JARVIS_GUIDE_CATALOG` through `guideCommand`, never typed by hand. */
  readonly command: string;
  /** Only step 7 ("Set up my morning workspace") sets this: `runStepPatches$`
   * calls `jarvis.close()` before `sendScripted` so the drive choreography
   * `JarvisDriverMachine` performs is actually visible once the overlay is
   * out of the way. */
  readonly closesOverlay?: boolean;
  /** Only step 6 ("Buy 5M EURUSD") sets this: `runStep` waits for the
   * matching `"confirmRequest"` turn event, holds one beat, then calls
   * `declineConfirmation()` — never `approveConfirmation()`, the demo must
   * never actually place a trade. Every other step ignores a
   * `"confirmRequest"` event entirely (none of their commands trigger
   * one). */
  readonly awaitsConfirmation?: boolean;
}

/** Looks up one command string from `JARVIS_GUIDE_CATALOG` by section title
 * + item index, so `JARVIS_DEMO_STEPS` below never re-types a command that
 * already lives in the catalog (and would silently drift from it — a demo
 * step sending stale wording the scripted brain no longer recognizes).
 * Throws — never returns `undefined` — on a miss: a demo step wired to a
 * nonexistent catalog entry must fail LOUD at module load (every importer
 * of this module evaluates `JARVIS_DEMO_STEPS` eagerly), not silently hand
 * an empty string to `sendScripted` at demo-run time. */
export function guideCommand(sectionTitle: string, index: number): string {
  const section = JARVIS_GUIDE_CATALOG.find((candidate) => {
    return candidate.title === sectionTitle;
  });

  if (section === undefined) {
    throw new Error(
      `JarvisDemoMachine: no guide section titled "${sectionTitle}"`,
    );
  }

  const item = section.items[index];

  if (item === undefined) {
    throw new Error(
      `JarvisDemoMachine: guide section "${sectionTitle}" has no item at index ${index}`,
    );
  }

  return item.command;
}

/**
 * The hands-free scripted demo's fixed 7-step script (spec table, §5) —
 * every command resolved from `JARVIS_GUIDE_CATALOG` via `guideCommand`
 * rather than re-typed, so a future catalog edit that moves or reworks one
 * of these rows fails this module's own top-level evaluation instead of
 * silently sending a stale command. `label` groups steps 2 and 3 under the
 * same "MARKET INTEL" tag, and steps 4 and 5 under "GENERATIVE UI" — both
 * are two-command beats within the SAME catalog section (`DESK
 * INTELLIGENCE`, `GENERATIVE UI` respectively), reflected in the label
 * rather than the (single) catalog section title. Step 7 ("morning
 * workspace") deliberately runs LAST and sets `closesOverlay` so the
 * `JarvisDriverMachine` choreography it triggers is visible once the
 * overlay is out of the way — see `createJarvisDemoMachine`'s doc for the
 * full step fold.
 */
export const JARVIS_DEMO_STEPS: readonly JarvisDemoStep[] = [
  { label: "DESK BRIEFING", command: guideCommand("DESK INTELLIGENCE", 3) },
  { label: "MARKET INTEL", command: guideCommand("DESK INTELLIGENCE", 1) },
  { label: "MARKET INTEL", command: guideCommand("DESK INTELLIGENCE", 0) },
  { label: "GENERATIVE UI", command: guideCommand("GENERATIVE UI", 0) },
  { label: "GENERATIVE UI", command: guideCommand("GENERATIVE UI", 2) },
  {
    label: "EXECUTION",
    command: guideCommand("EXECUTION", 0),
    awaitsConfirmation: true,
  },
  {
    label: "MORNING WORKSPACE",
    command: guideCommand("DESK CONTROL", 0),
    closesOverlay: true,
  },
];

export interface JarvisDemoState {
  readonly running: boolean;
  /** 1-based while `running` (the step currently in flight); `0` while
   * idle. */
  readonly stepIndex: number;
  /** Static — always `JARVIS_DEMO_STEPS.length`. */
  readonly stepCount: number;
  /** The in-flight step's `label`, or `null` while idle. */
  readonly label: string | null;
}

export interface JarvisDemoIntents {
  readonly startDemo: () => void;
  readonly stopDemo: () => void;
}

/** `createJarvisDemoMachine`'s return — named to match the
 * `JarvisDriverMachineHandle`/`JarvisPanelsMachineHandle` sibling idiom. No
 * `dispose`: like those, this is a session-lifetime composition singleton
 * with no per-consumer teardown seam. */
export interface JarvisDemoMachineHandle {
  readonly state$: StateObservable<JarvisDemoState>;
  readonly intents: JarvisDemoIntents;
}

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

const INITIAL_STATE: JarvisDemoState = {
  running: false,
  stepIndex: 0,
  stepCount: JARVIS_DEMO_STEPS.length,
  label: null,
};

function beatMsFor(level: PowerSaverLevel): number {
  return level === "freeze" ? 0 : DEMO_STEP_BEAT_MS;
}

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

function lastEntryId(entries: readonly JarvisEntry[] | undefined): number {
  if (!entries || entries.length === 0) {
    return -1;
  }

  const last = entries[entries.length - 1];
  return last ? last.id : -1;
}

/** True once `entries` contains the exact `[userEntry, jarvisEntry]` pair
 * `sendScripted(command)` appends for THIS step: a user-role entry with no
 * `origin` (an ordinary `send()`/`sendScripted()` turn, never a `narrate()`
 * one — see `JarvisEntry.origin`'s doc), id above `watermarkId` (appended
 * AFTER this step began, never a stale entry from an earlier step reusing
 * the same command text), text matching `command` exactly, immediately
 * followed by a jarvis-role entry (the streaming reply stub `turnItems$`'s
 * "start" item allocates in the SAME patch — see `JarvisMachine.ts`'s
 * `entryPatches$` doc). This is `runStep`'s sole signal that ITS turn (as
 * opposed to some OTHER turn already queued ahead of it, e.g. a racing
 * `narrate()` call) has actually started. */
function turnHasStarted(
  entries: readonly JarvisEntry[],
  watermarkId: number,
  command: string,
): boolean {
  return entries.some((entry, index) => {
    return (
      entry.id > watermarkId &&
      entry.role === "user" &&
      entry.origin === undefined &&
      entry.text === command &&
      entries[index + 1]?.role === "jarvis"
    );
  });
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
 * ended (`"done"` or `"error"`) — the settle-detection core this machine's
 * whole design turns on.
 *
 * **Correlation, not phase-watching.** The known interference risk: a
 * `narrate()` turn (`NarratorMachine`'s proactive dispatch) can land
 * mid-demo and drives the exact same `phase: "speaking" → "idle"`
 * transition a naive `pairwise()` watch on `phase` would mistake for THIS
 * step's own settle. Instead, `deps.jarvisState$`'s `entries` array is
 * watched for the precise `[userEntry, jarvisEntry]` pair `sendScripted`
 * is about to append (`turnHasStarted`, keyed off a `watermark` id captured
 * just before the call) — a narrator's own pair carries `origin:
 * "narrator"` and fails that match by construction, and even a same-text
 * coincidence can't fool it once `JarvisMachine`'s single turn-queue
 * `concatMap` is accounted for: if a `narrate()` call is already queued
 * ahead of this step's `sendScripted()`, THAT turn's pair appears first,
 * `turnHasStarted` correctly stays false against `command`, and this
 * function keeps waiting — it only starts trusting `jarvisEvents$` once
 * ITS OWN pair is visible.
 *
 * **Why the terminal signal comes from `jarvisEvents$`, not
 * `entries[...].done`.** `JarvisMachine.ts`'s own `eventPatch` sets
 * `JarvisEntry.done = true` identically for both `"done"` and `"error"` —
 * there is no separate error flag on `JarvisEntry` (verified against the
 * landed Task 4 interface; the original plan's "check the last entry's
 * error flag" sketch predates that shape). The raw `JarvisEvent.type`
 * discriminant is the only thing that actually distinguishes them, hence
 * `deps.jarvisEvents$`. Once `turnHasStarted` flips true, `JarvisMachine`'s
 * strict turn serialization (`concatMap` never advances to the next queued
 * request until the current turn's own `port.ask()` observable completes)
 * guarantees the very next `"done"`/`"error"` from `jarvisEvents$` belongs
 * to THIS turn — nothing else can be in flight until it ends — so the
 * correlation holds without needing a turn/entry id on the event itself.
 *
 * **Subscribe-before-fire.** The watcher (`merge` of both sources) is
 * subscribed FIRST, and `deps.jarvis.sendScripted(step.command)` is only
 * called from inside that subscription's setup — never the other way
 * around. `jarvisState$` is a replay-current `state()` stream so a "late"
 * subscriber would still see the pair (no real race there), but
 * `jarvisEvents$` is a plain hot multicast with no replay buffer; firing
 * `sendScripted` before the watcher is live risks missing a
 * synchronously-emitted event outright. Subscribing first is correct under
 * either timing assumption, so it costs nothing to be safe here.
 *
 * `step.awaitsConfirmation` (only step 6) additionally waits for the
 * matching `"confirmRequest"` event once the turn has started, delays one
 * beat (power-saver-aware, same `beatMsFor` every step's post-settle delay
 * uses), then calls `declineConfirmation()` — never `approveConfirmation()`.
 */
function runStep(
  step: JarvisDemoStep,
  deps: JarvisDemoDeps,
): Observable<"done" | "error"> {
  return new Observable<"done" | "error">((subscriber) => {
    const watermark = lastEntryId(readLatest(deps.jarvisState$)?.entries);
    let started = false;
    let confirmationHandled = false;
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
      if (!started) {
        if (
          item.kind === "state" &&
          turnHasStarted(item.state.entries, watermark, step.command)
        ) {
          started = true;
        }

        return;
      }

      if (item.kind !== "event") {
        return;
      }

      if (
        step.awaitsConfirmation &&
        !confirmationHandled &&
        item.event.type === "confirmRequest"
      ) {
        confirmationHandled = true;
        const beat = beatMsFor(readLatest(deps.powerSaverLevel$) ?? "off");

        declineTimerSub = timer(beat, deps.scheduler).subscribe(() => {
          deps.jarvis.declineConfirmation();
        });

        return;
      }

      if (item.event.type === "done") {
        subscriber.next("done");
        subscriber.complete();
        return;
      }

      if (item.event.type === "error") {
        subscriber.next("error");
        subscriber.complete();
      }
    });

    deps.jarvis.sendScripted(step.command);

    return () => {
      sub.unsubscribe();
      declineTimerSub?.unsubscribe();
    };
  });
}

type Patch = (s: JarvisDemoState) => JarvisDemoState;

function openPatch$(deps: JarvisDemoDeps): Observable<Patch> {
  return of(null).pipe(
    tap(() => {
      deps.jarvis.open();
    }),
    map((): Patch => {
      return (s: JarvisDemoState): JarvisDemoState => {
        return { ...s, running: true };
      };
    }),
  );
}

function finishPatch$(deps: JarvisDemoDeps): Observable<Patch> {
  return of(null).pipe(
    tap(() => {
      deps.jarvis.open();
    }),
    map((): Patch => {
      return (): JarvisDemoState => {
        return INITIAL_STATE;
      };
    }),
  );
}

function advancePatch$(
  step: JarvisDemoStep,
  index: number,
  deps: JarvisDemoDeps,
): Observable<Patch> {
  return of(null).pipe(
    tap(() => {
      if (step.closesOverlay) {
        deps.jarvis.close();
      }
    }),
    map((): Patch => {
      return (s: JarvisDemoState): JarvisDemoState => {
        return {
          ...s,
          running: true,
          stepIndex: index + 1,
          label: step.label,
        };
      };
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
): Observable<Patch> {
  const settle$: Observable<Patch> = runStep(step, deps).pipe(
    concatMap((outcome) => {
      if (outcome === "error") {
        return throwError(() => {
          return new Error(DEMO_ABORT_REASON);
        });
      }

      const beat = beatMsFor(readLatest(deps.powerSaverLevel$) ?? "off");
      return timer(beat, deps.scheduler).pipe(ignoreElements());
    }),
  );

  return concat(advancePatch$(step, index, deps), settle$);
}

/** One full demo run's `Patch` stream: `jarvis.open()`, all 7
 * `JARVIS_DEMO_STEPS` in order (`concatMap`, so step N+1 never starts
 * until step N's own turn has settled and paced its beat), then
 * `jarvis.open()` again + reset to idle. The `catchError` swallows a step's
 * abort throw (`runStepPatches$`'s doc) so the SAME reopen-and-reset tail
 * runs whether the loop finished all 7 steps or aborted early on an errored
 * turn — `jarvis.open()` is idempotent while already open (`JarvisMachine`'s
 * `openPatches$` guard), so re-calling it here is always safe, never a
 * double "just opened" event. */
function runDemo$(deps: JarvisDemoDeps): Observable<Patch> {
  const steps$: Observable<Patch> = from(JARVIS_DEMO_STEPS).pipe(
    concatMap((step, index) => {
      return runStepPatches$(step, index, deps);
    }),
    catchError(() => {
      return EMPTY;
    }),
  );

  return concat(openPatch$(deps), steps$, finishPatch$(deps));
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
 * its own decline), THEN signals `stop$`, which `takeUntil` uses to tear
 * down the in-flight step and a SEPARATE `stop$`-keyed patch resets state
 * to idle. The turn `sendScripted` already dispatched is left to finish
 * naturally — this machine has no way to cancel it (nor should it try:
 * it's a zero-cost, already-in-flight reply the user simply stops watching
 * the demo advance against).
 */
export function createJarvisDemoMachine(
  deps: JarvisDemoDeps,
): JarvisDemoMachineHandle {
  const start$ = new Subject<void>();
  const stop$ = new Subject<void>();

  const runPatches$: Observable<Patch> = start$.pipe(
    exhaustMap(() => {
      return runDemo$(deps).pipe(takeUntil(stop$));
    }),
  );

  const stopPatches$: Observable<Patch> = stop$.pipe(
    map((): Patch => {
      return (): JarvisDemoState => {
        return INITIAL_STATE;
      };
    }),
  );

  const stream$ = merge(runPatches$, stopPatches$).pipe(
    scan((s, patch): JarvisDemoState => {
      return patch(s);
    }, INITIAL_STATE),
  );

  const state$: StateObservable<JarvisDemoState> = state(
    stream$,
    INITIAL_STATE,
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

        stop$.next();
      },
    },
  };
}
