import { type StateObservable, state } from "@rx-state/core";
import {
  concat,
  EMPTY,
  interval,
  merge,
  type Observable,
  of,
  Subject,
} from "rxjs";
import {
  concatMap,
  filter,
  map,
  scan,
  share,
  switchMap,
  take,
  takeUntil,
} from "rxjs/operators";

import type {
  JarvisConfirmation,
  JarvisEntry,
  JarvisIntents,
  JarvisMachineHandle,
  JarvisPort,
  JarvisRole,
  JarvisState,
} from "@rtc/core-api";
import {
  JARVIS_CONFIRM_TIMEOUT_MS,
  JARVIS_GREETING,
  JARVIS_NARRATION_PREFIX,
  type JarvisBrain,
  type JarvisEffort,
  type JarvisSkin,
} from "@rtc/domain";

import type { JarvisAvailability, JarvisEvent } from "#/adapters/jarvisPort";

import type { DriveOutcome } from "./JarvisDriverMachine";
import {
  approvePatch,
  closePatch,
  confirmTotalTicks,
  createJarvisController,
  declinePatch,
  JARVIS_INITIAL_STATE,
  JARVIS_SIM_AVAILABILITY,
  type JarvisPatch,
  type JarvisTurnRequest,
  openPatch,
  skinPatch,
  togglePatch,
} from "./jarvisController";

/** Moved to `./jarvisController` (pluggable-core slice 7 wave 2) —
 * re-exported so existing imports keep working. */
export {
  formatBrainHint,
  formatGateHint,
  formatGateResetTime,
} from "./jarvisController";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type {
  JarvisConfirmation,
  JarvisEntry,
  JarvisIntents,
  JarvisMachineHandle,
  JarvisRole,
  JarvisState,
};

export interface JarvisDeps {
  port: JarvisPort;
  skin$: Observable<JarvisSkin>;
  setSkin: (skin: JarvisSkin) => void;
  /** Live availability of the Jarvis backend. Defaults to an
   * always-available, scripted-only value — simulator mode
   * (`ScriptedJarvisAdapter`) and any legacy caller that doesn't wire this
   * in are always available, offering only the `"scripted"` brain. WS-real
   * mode threads in `WsJarvisAdapter.availability$()` (see composition.ts). */
  availability$?: Observable<JarvisAvailability>;
  /** The user's preferred brain (a preferences-port pass-through). Folded
   * with `availability$` to resolve `state.effectiveBrain` — see
   * `JarvisState.effectiveBrain`'s doc. */
  preferredBrain$: Observable<JarvisBrain>;
  /** The user's preferred thinking-effort budget, forwarded on every
   * `port.ask()` call alongside the resolved effective brain. Not itself
   * reflected in `JarvisState` — only `ask()`'s wire payload reads it. */
  effort$: Observable<JarvisEffort>;
  /** Injectable for tests; defaults to JARVIS_CONFIRM_TIMEOUT_MS. */
  confirmTimeoutMs?: number;
}

/** Re-exported from `@rtc/domain` (`jarvis/jarvisConstants.ts`), where the
 * contract suites can read them (pluggable-core slice 7 wave 2). */
export { JARVIS_CONFIRM_TIMEOUT_MS, JARVIS_GREETING, JARVIS_NARRATION_PREFIX };

// A named tag (rather than an inline `{ type: "confirmRequest" }` literal)
// so `Extract<JarvisEvent, ...>` never takes an inline object type argument —
// the repo's `no-restricted-syntax` bans that even inside a type alias (see
// eslint.config.mjs's `restrictedSyntax` comment).
interface ConfirmRequestTag {
  readonly type: "confirmRequest";
}
type ConfirmRequestEvent = Extract<JarvisEvent, ConfirmRequestTag>;

function isConfirmRequest(event: JarvisEvent): event is ConfirmRequestEvent {
  return event.type === "confirmRequest";
}

/** The synthetic "start" of a turn: the controller's patch appending the
 * user entry + streaming jarvis stub, phase → speaking. */
interface TurnStartItem {
  readonly kind: "start";
  readonly patch: JarvisPatch;
}

/** One reply event forwarded from `port.ask(text)`. `origin` is the
 * enclosing turn's origin (undefined for an ordinary `send()` turn,
 * `"narrator"` for a `narrate()` turn) — threaded through so the event
 * patch can fold `unreadNarration` without any mutable cross-turn state. */
interface TurnEventItem {
  readonly kind: "event";
  readonly event: JarvisEvent;
  readonly origin: "narrator" | undefined;
}

/** One item flowing through a single turn. */
type TurnItem = TurnStartItem | TurnEventItem;

function isTurnEventItem(item: TurnItem): item is TurnEventItem {
  return item.kind === "event";
}

/** The RxJS shell over `createJarvisController` (`./jarvisController`):
 * the rules live there; this file owns only the timing — the serial turn
 * queue, the confirmation countdown and the preference subscriptions. */
export function createJarvisMachine(deps: JarvisDeps): JarvisMachineHandle {
  const confirmTimeoutMs = deps.confirmTimeoutMs ?? JARVIS_CONFIRM_TIMEOUT_MS;
  const availabilitySource$: Observable<JarvisAvailability> =
    deps.availability$ ?? of(JARVIS_SIM_AVAILABILITY);
  const controller = createJarvisController();

  // Looked up on every call, never captured: a port whose `confirm` is
  // replaced after construction (a spy, a decorator) is still the one told.
  function confirmThroughPort(confirmationId: string, approved: boolean): void {
    deps.port.confirm(confirmationId, approved);
  }

  const turn$ = new Subject<JarvisTurnRequest>();
  const open$ = new Subject<void>();
  const close$ = new Subject<void>();
  const toggle$ = new Subject<void>();
  const approve$ = new Subject<void>();
  const decline$ = new Subject<void>();
  const driveOutcome$ = new Subject<DriveOutcome>();

  // Turns run sequentially: concatMap only advances to the next queued
  // request once the previous turn's port.ask() observable has completed —
  // and plans each turn only when it is DEQUEUED (the controller's
  // `planTurn` doc). send(), sendScripted() and narrate() all feed `turn$`,
  // so any one arriving mid-turn queues behind whichever is in flight.
  // share() is required: entryPatches$ and events$ are independent
  // consumers, and without it each would trigger its own port.ask() call
  // and entry-id allocation.
  const turnItems$: Observable<TurnItem> = turn$.pipe(
    concatMap((req) => {
      const plan = controller.planTurn(req);

      if (plan === null) {
        return EMPTY;
      }

      return concat(
        of<TurnItem>({ kind: "start", patch: plan.start }),
        deps.port.ask(plan.wireText, plan.options).pipe(
          map((event): TurnItem => {
            return { kind: "event", event, origin: plan.origin };
          }),
        ),
      );
    }),
    share(),
  );

  const entryPatches$: Observable<JarvisPatch> = turnItems$.pipe(
    map((item): JarvisPatch => {
      return item.kind === "start"
        ? item.patch
        : controller.eventPatch(item.event, item.origin);
    }),
  );

  // Every reply event from every turn — see JarvisMachineHandle's doc for
  // why this is exposed and what the caller must do with it.
  const events$: Observable<JarvisEvent> = turnItems$.pipe(
    filter(isTurnEventItem),
    map((item) => {
      return item.event;
    }),
  );

  // Resolved by an explicit approve/decline, cancelling the ticking timer
  // early. A later confirmRequest also supersedes it (switchMap).
  const resolution$ = merge(approve$, decline$);

  const timerPatches$: Observable<JarvisPatch> = events$.pipe(
    filter(isConfirmRequest),
    switchMap((req) => {
      const totalTicks = confirmTotalTicks(confirmTimeoutMs);
      return interval(1000).pipe(
        take(totalTicks),
        map((tickIndex): JarvisPatch => {
          return controller.confirmTickPatch(
            req.confirmationId,
            tickIndex + 1,
            totalTicks,
            confirmThroughPort,
          );
        }),
        takeUntil(resolution$),
      );
    }),
  );

  const driveOutcomePatches$: Observable<JarvisPatch> = driveOutcome$.pipe(
    map((outcome) => {
      return controller.driveOutcomePatch(outcome);
    }),
    filter((patch): patch is JarvisPatch => {
      return patch !== null;
    }),
  );

  // The single live subscriber of each source (via the `warm` subscription
  // below), so each availability / preferred-brain value refreshes the
  // controller's caches exactly once.
  const availabilityPatches$: Observable<JarvisPatch> =
    availabilitySource$.pipe(
      map((value) => {
        return controller.availabilityPatch(value);
      }),
    );

  const preferredBrainPatches$: Observable<JarvisPatch> =
    deps.preferredBrain$.pipe(
      map((brain) => {
        return controller.preferredBrainPatch(brain);
      }),
    );

  // effort has no JarvisState field of its own — only ask()'s options read
  // it — so this is a plain side-channel subscription rather than a patch,
  // torn down alongside the others in dispose() below.
  const effortSubscription = deps.effort$.subscribe((value) => {
    controller.setEffort(value);
  });

  const stream$ = merge(
    entryPatches$,
    timerPatches$,
    approve$.pipe(
      map(() => {
        return approvePatch(confirmThroughPort);
      }),
    ),
    decline$.pipe(
      map(() => {
        return declinePatch(confirmThroughPort);
      }),
    ),
    open$.pipe(
      map(() => {
        return openPatch;
      }),
    ),
    close$.pipe(
      map(() => {
        return closePatch;
      }),
    ),
    toggle$.pipe(
      map(() => {
        return togglePatch;
      }),
    ),
    driveOutcomePatches$,
    deps.skin$.pipe(map(skinPatch)),
    availabilityPatches$,
    preferredBrainPatches$,
  ).pipe(
    scan((s: JarvisState, patch: JarvisPatch) => {
      return patch(s);
    }, JARVIS_INITIAL_STATE),
  );

  const state$: StateObservable<JarvisState> = state(
    stream$,
    JARVIS_INITIAL_STATE,
  );

  // Keep state$ warm so it carries its default (and any synchronous skin$
  // replay) before useMachine first renders.
  const warm = state$.subscribe();

  return {
    state$,
    events$,
    intents: {
      open: () => {
        open$.next();
      },
      close: () => {
        close$.next();
      },
      toggle: () => {
        toggle$.next();
      },
      send: (text: string) => {
        turn$.next({ kind: "send", text });
      },
      sendScripted: (text: string) => {
        turn$.next({ kind: "sendScripted", text });
      },
      narrate: (prompt: string) => {
        turn$.next({ kind: "narrate", prompt });
      },
      approveConfirmation: () => {
        approve$.next();
      },
      declineConfirmation: () => {
        decline$.next();
      },
      setSkin: (skin: JarvisSkin) => {
        deps.setSkin(skin);
      },
      recordDriveOutcome: (outcome: DriveOutcome) => {
        driveOutcome$.next(outcome);
      },
    },
    dispose: () => {
      // Complete the source Subjects first so the merged stream — and the
      // react-rxjs state$ derived from it — completes, then release the warm
      // subscription that was keeping state$ alive, and the side-channel
      // effort$ subscription alongside it.
      turn$.complete();
      open$.complete();
      close$.complete();
      toggle$.complete();
      approve$.complete();
      decline$.complete();
      driveOutcome$.complete();
      warm.unsubscribe();
      effortSubscription.unsubscribe();
    },
  };
}
