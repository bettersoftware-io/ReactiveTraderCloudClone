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

import {
  DEFAULT_JARVIS_SKIN,
  type Direction,
  type JarvisSkin,
} from "@rtc/domain";

import type { JarvisEvent, JarvisPort } from "#/adapters/jarvisPort";

import type { Machine } from "./machine";

export const JARVIS_CONFIRM_TIMEOUT_MS = 60_000;
export const JARVIS_GREETING =
  "Good morning, sir. J.A.R.V.I.S online — all trading systems nominal. " +
  "I can quote the majors, report the movers, brief you on the desk, or execute FX orders. How may I assist?";

export type JarvisRole = "user" | "jarvis";

export interface JarvisEntry {
  readonly id: number;
  readonly role: JarvisRole;
  readonly text: string;
  /** false while deltas are still streaming into this entry */
  readonly done: boolean;
  readonly tool?: {
    readonly name: string;
    readonly status: "running" | "done";
  };
}

export interface JarvisConfirmation {
  readonly confirmationId: string;
  readonly symbol: string;
  readonly direction: Direction;
  readonly notional: number;
  readonly quotedPrice: number;
  /** Display precision for quotedPrice — CurrencyPair.ratePrecision, so the
   * confirm card formats exactly like the price tiles. */
  readonly ratePrecision: number;
  /** 1 → just requested, 0 → expired; ticks down once per second */
  readonly remainingFraction: number;
}

export interface JarvisState {
  readonly open: boolean;
  readonly skin: JarvisSkin;
  readonly unread: number;
  readonly phase: "idle" | "speaking";
  readonly entries: readonly JarvisEntry[];
  readonly pendingConfirmation: JarvisConfirmation | null;
  /** Live availability of the Jarvis backend; always true in sim mode
   * (deps.availability$ defaults to `of(true)`). `send()` while false is a
   * silent no-op — no user entry is appended and `port.ask` is never
   * called. The UI doesn't read this yet (a later task surfaces it). */
  readonly available: boolean;
}

export interface JarvisIntents {
  open: () => void;
  close: () => void;
  toggle: () => void;
  send: (text: string) => void;
  approveConfirmation: () => void;
  declineConfirmation: () => void;
  setSkin: (skin: JarvisSkin) => void;
}

export interface JarvisDeps {
  port: JarvisPort;
  skin$: Observable<JarvisSkin>;
  setSkin: (skin: JarvisSkin) => void;
  /** Live availability of the Jarvis backend. Defaults to `of(true)` —
   * simulator mode (`ScriptedJarvisAdapter`) and any legacy caller that
   * doesn't wire this in are always available. WS-real mode threads in
   * `WsJarvisAdapter.availability$()` (see composition.ts). */
  availability$?: Observable<boolean>;
  /** Injectable for tests; defaults to JARVIS_CONFIRM_TIMEOUT_MS. */
  confirmTimeoutMs?: number;
}

type Patch = (s: JarvisState) => JarvisState;

const GREETING_ENTRY: JarvisEntry = {
  id: 0,
  role: "jarvis",
  text: JARVIS_GREETING,
  done: true,
};

const INITIAL: JarvisState = {
  open: false,
  skin: DEFAULT_JARVIS_SKIN,
  unread: 0,
  phase: "idle",
  entries: [GREETING_ENTRY],
  pendingConfirmation: null,
  available: true,
};

/** Replace the last entry (the one currently streaming/accumulating) with the
 * result of `fn`. Turns run sequentially (concatMap), so at any point at most
 * one jarvis entry is being folded and it is always the array's tail. */
function updateLastEntry(
  entries: readonly JarvisEntry[],
  fn: (e: JarvisEntry) => JarvisEntry,
): readonly JarvisEntry[] {
  if (entries.length === 0) {
    return entries;
  }

  const lastIndex = entries.length - 1;
  const last = entries[lastIndex];

  if (!last) {
    return entries;
  }

  const next = [...entries];
  next[lastIndex] = fn(last);
  return next;
}

/** Fold one reply event from an in-flight turn into a state Patch. */
function eventPatch(event: JarvisEvent): Patch {
  switch (event.type) {
    case "delta":
      return (s: JarvisState): JarvisState => {
        return {
          ...s,
          entries: updateLastEntry(s.entries, (e) => {
            return { ...e, text: e.text + event.text };
          }),
        };
      };

    case "toolEvent":
      return (s: JarvisState): JarvisState => {
        return {
          ...s,
          entries: updateLastEntry(s.entries, (e) => {
            return { ...e, tool: { name: event.tool, status: event.status } };
          }),
        };
      };

    case "done":
      return (s: JarvisState): JarvisState => {
        return {
          ...s,
          phase: "idle",
          unread: s.open ? s.unread : s.unread + 1,
          entries: updateLastEntry(s.entries, (e) => {
            return { ...e, done: true };
          }),
        };
      };

    case "error":
      return (s: JarvisState): JarvisState => {
        return {
          ...s,
          phase: "idle",
          unread: s.open ? s.unread : s.unread + 1,
          // Drop `tool` entirely rather than leaving it at whatever status a
          // prior toolEvent left it in: a later sequential snapshot read
          // (e.g. ScriptedJarvisAdapter's pnl/movers turns) can still time
          // out into an error after toolEvent(running) already landed, and
          // without clearing it the finalized entry would show error text
          // alongside a permanently-stuck "running" badge.
          entries: updateLastEntry(s.entries, (e) => {
            const { tool: _tool, ...rest } = e;
            return { ...rest, text: event.message, done: true };
          }),
        };
      };

    case "confirmRequest":
      return (s: JarvisState): JarvisState => {
        return {
          ...s,
          pendingConfirmation: {
            confirmationId: event.confirmationId,
            symbol: event.symbol,
            direction: event.direction,
            notional: event.notional,
            quotedPrice: event.quotedPrice,
            ratePrecision: event.ratePrecision,
            remainingFraction: 1,
          },
        };
      };

    default: {
      const _exhaustive: never = event;

      return (s: JarvisState): JarvisState => {
        return s;
      };
    }
  }
}

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

/** The synthetic "start" of a `send()` turn: user entry + streaming jarvis
 * stub appended, phase → speaking. */
interface TurnStartItem {
  readonly kind: "start";
  readonly userEntry: JarvisEntry;
  readonly jarvisEntry: JarvisEntry;
}

/** One reply event forwarded from `port.ask(text)`. */
interface TurnEventItem {
  readonly kind: "event";
  readonly event: JarvisEvent;
}

/** One item flowing through a single `send()` turn. */
type TurnItem = TurnStartItem | TurnEventItem;

export function createJarvisMachine(
  deps: JarvisDeps,
): Machine<JarvisState, JarvisIntents> {
  const confirmTimeoutMs = deps.confirmTimeoutMs ?? JARVIS_CONFIRM_TIMEOUT_MS;
  const availabilitySource$: Observable<boolean> =
    deps.availability$ ?? of(true);

  // Cached alongside INITIAL.available and kept in lockstep by
  // availabilityPatches$ below (the only subscriber of availabilitySource$,
  // active from construction via the `warm` state$ subscription). send()
  // needs the CURRENT value at call time, not a stream to fold into a
  // patch — and, per wireJarvisHistorySource's doc in composition.ts,
  // state$'s getValue() isn't reliably synchronous, so a mutable cache
  // updated by the one live subscription is the same pattern used there.
  let available = true;

  const send$ = new Subject<string>();
  const open$ = new Subject<void>();
  const close$ = new Subject<void>();
  const toggle$ = new Subject<void>();
  const approve$ = new Subject<void>();
  const decline$ = new Subject<void>();

  let nextEntryId = 1; // 0 is the greeting entry

  // Turns run sequentially: concatMap only advances to the next queued send()
  // once the previous turn's port.ask() observable has completed. share()
  // is required here — entryPatches$ and confirmRequests$ below are two
  // independent consumers, and without it each would trigger its own
  // subscription (and its own port.ask() call + entry-id allocation).
  const turnItems$: Observable<TurnItem> = send$.pipe(
    concatMap((text) => {
      // Unavailable → silent no-op: no user entry appended (the "start"
      // item below is never built) and port.ask is never called.
      if (!available) {
        return EMPTY;
      }

      const userEntry: JarvisEntry = {
        id: nextEntryId++,
        role: "user",
        text,
        done: true,
      };

      const jarvisEntry: JarvisEntry = {
        id: nextEntryId++,
        role: "jarvis",
        text: "",
        done: false,
      };
      return concat(
        of<TurnItem>({ kind: "start", userEntry, jarvisEntry }),
        deps.port.ask(text).pipe(
          map((event): TurnItem => {
            return { kind: "event", event };
          }),
        ),
      );
    }),
    share(),
  );

  const entryPatches$: Observable<Patch> = turnItems$.pipe(
    map((item): Patch => {
      if (item.kind === "start") {
        return (s: JarvisState): JarvisState => {
          return {
            ...s,
            phase: "speaking",
            entries: [...s.entries, item.userEntry, item.jarvisEntry],
          };
        };
      }

      return eventPatch(item.event);
    }),
  );

  const confirmRequests$: Observable<ConfirmRequestEvent> = turnItems$.pipe(
    filter((item): item is TurnEventItem => {
      return item.kind === "event";
    }),
    map((item) => {
      return item.event;
    }),
    filter(isConfirmRequest),
  );

  // Resolved by an explicit approve/decline, cancelling the ticking timer
  // early. A later confirmRequest also supersedes it (switchMap).
  const resolution$ = merge(approve$, decline$);

  const timerPatches$: Observable<Patch> = confirmRequests$.pipe(
    switchMap((req) => {
      const totalTicks = Math.max(1, Math.round(confirmTimeoutMs / 1000));
      return interval(1000).pipe(
        take(totalTicks),
        map((tickIndex): Patch => {
          const ticksElapsed = tickIndex + 1;

          if (ticksElapsed >= totalTicks) {
            // Expiry: auto-decline and clear.
            deps.port.confirm(req.confirmationId, false);

            return (s: JarvisState): JarvisState => {
              if (
                s.pendingConfirmation?.confirmationId !== req.confirmationId
              ) {
                return s;
              }

              return { ...s, pendingConfirmation: null };
            };
          }

          const remainingFraction = 1 - ticksElapsed / totalTicks;

          return (s: JarvisState): JarvisState => {
            if (
              !s.pendingConfirmation ||
              s.pendingConfirmation.confirmationId !== req.confirmationId
            ) {
              return s;
            }

            return {
              ...s,
              pendingConfirmation: {
                ...s.pendingConfirmation,
                remainingFraction,
              },
            };
          };
        }),
        takeUntil(resolution$),
      );
    }),
  );

  const approvePatches$: Observable<Patch> = approve$.pipe(
    map((): Patch => {
      return (s: JarvisState): JarvisState => {
        if (!s.pendingConfirmation) {
          return s;
        }

        deps.port.confirm(s.pendingConfirmation.confirmationId, true);
        return { ...s, pendingConfirmation: null };
      };
    }),
  );

  const declinePatches$: Observable<Patch> = decline$.pipe(
    map((): Patch => {
      return (s: JarvisState): JarvisState => {
        if (!s.pendingConfirmation) {
          return s;
        }

        deps.port.confirm(s.pendingConfirmation.confirmationId, false);
        return { ...s, pendingConfirmation: null };
      };
    }),
  );

  const openPatches$: Observable<Patch> = open$.pipe(
    map((): Patch => {
      return (s: JarvisState): JarvisState => {
        return { ...s, open: true, unread: 0 };
      };
    }),
  );

  const closePatches$: Observable<Patch> = close$.pipe(
    map((): Patch => {
      return (s: JarvisState): JarvisState => {
        return { ...s, open: false };
      };
    }),
  );

  const togglePatches$: Observable<Patch> = toggle$.pipe(
    map((): Patch => {
      return (s: JarvisState): JarvisState => {
        const open = !s.open;
        return { ...s, open, unread: open ? 0 : s.unread };
      };
    }),
  );

  // The port is the source of truth for the skin, same loop as every other
  // preference: setSkin() writes through deps.setSkin, and state.skin only
  // ever changes by following skin$ back.
  const skinPatches$: Observable<Patch> = deps.skin$.pipe(
    map((skin): Patch => {
      return (s: JarvisState): JarvisState => {
        return { ...s, skin };
      };
    }),
  );

  // The single live subscriber of availabilitySource$ (via stream$'s `warm`
  // subscription below): folds the value into state AND refreshes the
  // `available` cache that turnItems$'s concatMap reads synchronously.
  const availabilityPatches$: Observable<Patch> = availabilitySource$.pipe(
    map((value): Patch => {
      available = value;

      return (s: JarvisState): JarvisState => {
        return { ...s, available: value };
      };
    }),
  );

  const stream$ = merge(
    entryPatches$,
    timerPatches$,
    approvePatches$,
    declinePatches$,
    openPatches$,
    closePatches$,
    togglePatches$,
    skinPatches$,
    availabilityPatches$,
  ).pipe(
    scan((s, patch) => {
      return patch(s);
    }, INITIAL),
  );

  const state$: StateObservable<JarvisState> = state(stream$, INITIAL);

  // Keep state$ warm so it carries its default (and any synchronous skin$
  // replay) before useMachine first renders.
  const warm = state$.subscribe();

  return {
    state$,
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
        send$.next(text);
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
    },
    dispose: () => {
      // Complete the source Subjects first so the merged stream — and the
      // react-rxjs state$ derived from it — completes, then release the warm
      // subscription that was keeping state$ alive.
      send$.complete();
      open$.complete();
      close$.complete();
      toggle$.complete();
      approve$.complete();
      decline$.complete();
      warm.unsubscribe();
    },
  };
}
