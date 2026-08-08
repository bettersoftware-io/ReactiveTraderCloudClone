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
  DEFAULT_JARVIS_BRAIN,
  DEFAULT_JARVIS_EFFORT,
  DEFAULT_JARVIS_SKIN,
  type Direction,
  JARVIS_BRAINS,
  type JarvisBrain,
  type JarvisEffort,
  type JarvisSkin,
} from "@rtc/domain";

import type {
  JarvisAvailability,
  JarvisEvent,
  JarvisPort,
} from "#/adapters/jarvisPort";

import type { DriveOutcome } from "./JarvisDriverMachine";
import type { Machine } from "./machine";

export const JARVIS_CONFIRM_TIMEOUT_MS = 60_000;
export const JARVIS_GREETING =
  "Good morning, sir. J.A.R.V.I.S online — all trading systems nominal. " +
  "I can quote the majors, report the movers, brief you on the desk, or execute FX orders. How may I assist?";

/** The literal prefix a `narrate()` prompt is expected to carry (per
 * `NarratorMachine`'s pinned prompt format — see its doc). `narrate()`
 * strips this for the transcript's DISPLAY text but forwards the prompt
 * unchanged (prefix included) to `port.ask` as the wire text — see
 * `JarvisIntents.narrate`'s doc. */
export const JARVIS_NARRATION_PREFIX = "[narration] ";

/** Strip `JARVIS_NARRATION_PREFIX` from a narrate prompt for display; a
 * prompt without the prefix passes through unchanged (defensive — every
 * real caller is `NarratorMachine`, which always includes it). */
function stripNarrationPrefix(prompt: string): string {
  return prompt.startsWith(JARVIS_NARRATION_PREFIX)
    ? prompt.slice(JARVIS_NARRATION_PREFIX.length)
    : prompt;
}

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
  /** Set on the USER-side entry of a `narrate()` turn — the proactive
   * app-driving narrator dispatched this turn unsolicited, rather than the
   * user typing it. Absent (not `false`) on every ordinary `send()` turn. */
  readonly origin?: "narrator";
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
  /** Set when a `narrate()` turn completes while `open` is false; NOT set
   * when a narrate turn completes while open (unlike `unread`, which still
   * counts either way — the narrator flare is specifically "JARVIS spoke up
   * unprompted while you weren't looking"). Cleared by `open()` (and by
   * `toggle()` opening, mirroring `unread`'s own open-clears-it rule). */
  readonly unreadNarration: boolean;
  readonly phase: "idle" | "speaking";
  readonly entries: readonly JarvisEntry[];
  readonly pendingConfirmation: JarvisConfirmation | null;
  /** Live availability of the Jarvis backend; always true in sim mode
   * (deps.availability$ defaults to an always-available, scripted-only
   * value — see `createJarvisMachine`). `send()` while false is a silent
   * no-op — no user entry is appended and `port.ask` is never called. Both
   * web clients read it: `JarvisOrb` renders `null` and `useJarvisHotkey`
   * disarms ⌘/Ctrl+J while it is false. */
  readonly available: boolean;
  /** Brains currently on offer, per the live `availability$` feed (or the
   * sim-mode default's scripted-only offering). An empty array is a normal
   * value (nothing offered right now), not a nullish sentinel — see
   * `JarvisAvailability`'s doc. */
  readonly brains: readonly JarvisBrain[];
  /** The brain this session's turns actually run with: the user's
   * preferred brain (`JarvisDeps.preferredBrain$`) when it's among
   * `brains`, else `availability`'s own `defaultBrain`. Re-resolved on
   * every `preferredBrain$` emission AND every `availability$` emission
   * (an availability flip can un-offer the currently-preferred brain
   * mid-session). */
  readonly effectiveBrain: JarvisBrain;
}

export interface JarvisIntents {
  open: () => void;
  close: () => void;
  toggle: () => void;
  send: (text: string) => void;
  /** Dispatches an UNSOLICITED turn — the proactive app-driving narrator's
   * entry point (`NarratorMachine`, a later task), not a user action. Enters
   * the SAME turn queue as `send` (a narrate arriving while a send is still
   * in flight queues behind it, per the shared `concatMap`), and is the same
   * silent no-op as `send` while `state.available` is false. `prompt` is
   * expected to carry the literal `JARVIS_NARRATION_PREFIX` — it rides
   * unchanged to `port.ask` as the wire text, while the transcript's
   * user-side entry displays it WITHOUT that prefix and flagged
   * `origin: "narrator"`. */
  narrate: (prompt: string) => void;
  approveConfirmation: () => void;
  declineConfirmation: () => void;
  setSkin: (skin: JarvisSkin) => void;
  /** Folds one `DriveOutcome` (`JarvisDriverMachine`'s per-command result,
   * not a user action) into the transcript: an `"applied"` outcome appends
   * a new jarvis-role entry with text `` `drive: ${outcome.command.kind}` ``
   * (e.g. "drive: switchTab"); a `"skipped"` outcome folds NOTHING — the
   * filter lives in THIS machine's fold (not at the `outcomes$` source) so
   * a future consumer that wants skipped outcomes too (e.g. a debug view)
   * isn't already filtered upstream. No turn correlation: the entry appends
   * at arrival, independent of `phase`/any in-flight `send`/`narrate` turn,
   * mirroring how `toolEvent`/`done` entries append at arrival too.
   * `composition.ts` wires this from `jarvisDriver.outcomes$` AFTER both
   * machines exist (a late-bound subscription — `jarvisDriver` is built
   * FROM this machine's own `events$`, so this machine can't depend on
   * `jarvisDriver`'s output at CONSTRUCTION time without a cycle). */
  recordDriveOutcome: (outcome: DriveOutcome) => void;
}

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
  unreadNarration: false,
  phase: "idle",
  entries: [GREETING_ENTRY],
  pendingConfirmation: null,
  available: true,
  brains: JARVIS_BRAINS,
  effectiveBrain: DEFAULT_JARVIS_BRAIN,
};

/** Sim-mode / legacy-caller default for `JarvisDeps.availability$`: always
 * available, offering only the scripted (offline) brain — matches
 * `ScriptedJarvisAdapter`'s actual capability, unlike `INITIAL.brains`
 * (which offers every selectable brain before any real availability
 * feed has resolved). */
const DEFAULT_AVAILABILITY: JarvisAvailability = {
  available: true,
  brains: ["scripted"],
  defaultBrain: "scripted",
  gate: null,
};

/** Resolves which brain a turn actually runs with: the preferred brain when
 * it's among the ones currently on offer, else the availability feed's own
 * default. `availability.brains` is trusted as-is — an empty array (nothing
 * offered) falls through to `defaultBrain` the same as any other
 * not-offered case; no separate check on `availability.available` is
 * needed here (see `JarvisAvailability`'s "key everything off `available`"
 * doc — that's a caution for CONSUMERS of `state.available`, not a
 * precondition this resolver needs to duplicate). */
function resolveEffectiveBrain(
  preferredBrain: JarvisBrain,
  availability: JarvisAvailability,
): JarvisBrain {
  return availability.brains.includes(preferredBrain)
    ? preferredBrain
    : availability.defaultBrain;
}

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

/** Fold one reply event from an in-flight turn into a state Patch.
 * `turnOrigin` is the enclosing turn's origin (set by `turnItems$`'s
 * `concatMap` when it builds each turn's "start" item — see its doc): only
 * `"narrator"`-origin turns bump `unreadNarration` on completion. */
function eventPatch(
  event: JarvisEvent,
  turnOrigin: "narrator" | undefined,
): Patch {
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
          unreadNarration:
            turnOrigin === "narrator" && !s.open ? true : s.unreadNarration,
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
          unreadNarration:
            turnOrigin === "narrator" && !s.open ? true : s.unreadNarration,
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

    case "panel":
      // Deliberate no-op: panel events are owned by the separate
      // JarvisPanelsMachine (Task 5), not this chat-state machine.
      return (s: JarvisState): JarvisState => {
        return s;
      };

    case "command":
      // Deliberate no-op, mirroring "panel" above: command batches are
      // applied by a separate drive-the-app machine/adapter (a later P5
      // task), not folded into chat entries here.
      return (s: JarvisState): JarvisState => {
        return s;
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

/** The synthetic "start" of a turn (`send()` or `narrate()`): user entry +
 * streaming jarvis stub appended, phase → speaking. */
interface TurnStartItem {
  readonly kind: "start";
  readonly userEntry: JarvisEntry;
  readonly jarvisEntry: JarvisEntry;
}

/** One reply event forwarded from `port.ask(text)`. `origin` is the
 * enclosing turn's origin (undefined for an ordinary `send()` turn,
 * `"narrator"` for a `narrate()` turn) — threaded through so `eventPatch`'s
 * "done"/"error" cases can fold `unreadNarration` without any mutable
 * cross-turn state. */
interface TurnEventItem {
  readonly kind: "event";
  readonly event: JarvisEvent;
  readonly origin: "narrator" | undefined;
}

/** One item flowing through a single turn (`send()` or `narrate()`). */
type TurnItem = TurnStartItem | TurnEventItem;

/** One request enqueued into the shared turn queue — `send()` and
 * `narrate()` both feed the same `concatMap`, so a `narrate()` arriving
 * while a `send()` is in flight queues behind it (and vice versa). */
type TurnRequest =
  | { readonly kind: "send"; readonly text: string }
  | { readonly kind: "narrate"; readonly prompt: string };

function isTurnEventItem(item: TurnItem): item is TurnEventItem {
  return item.kind === "event";
}

/** `createJarvisMachine`'s return, widened with `events$` — every reply
 * event from every turn (`port.ask()` call), across the machine's whole
 * session lifetime. Task 6's sole event source for `JarvisPanelsMachine`
 * (composition.ts wires it in): panel events ride the same per-turn
 * `JarvisEvent` stream as everything else `ask()` emits (this machine's own
 * `"panel"` case is a deliberate no-op — see its doc above), and this is the
 * one place that stream is exposed outside the turn-sequencing internals.
 * Callers MUST catchError-guard this before handing it to
 * `createJarvisPanelsMachine`: that machine's `events$` input is TERMINAL on
 * error (kills its fold), and nothing here narrows what `port.ask()` could
 * do. */
export interface JarvisMachineHandle
  extends Machine<JarvisState, JarvisIntents> {
  readonly events$: Observable<JarvisEvent>;
}

export function createJarvisMachine(deps: JarvisDeps): JarvisMachineHandle {
  const confirmTimeoutMs = deps.confirmTimeoutMs ?? JARVIS_CONFIRM_TIMEOUT_MS;
  const availabilitySource$: Observable<JarvisAvailability> =
    deps.availability$ ?? of(DEFAULT_AVAILABILITY);

  // Synchronous mutable caches, kept in lockstep by availabilityPatches$ /
  // preferredBrainPatches$ / effortSubscription below (the only
  // subscribers of their respective sources, active from construction via
  // the `warm` state$ subscription / the dedicated effort$ subscription).
  // send() needs the CURRENT values at call time, not a stream to fold into
  // a patch — and, per wireJarvisHistorySource's doc in composition.ts,
  // state$'s getValue() isn't reliably synchronous, so a mutable cache
  // updated by the one live subscription is the same pattern used there.
  // Seeded to match INITIAL (available, every selectable brain offered),
  // NOT DEFAULT_AVAILABILITY (the sim-mode scripted-only fallback) — this
  // cache is what a same-tick send() reads before the FIRST
  // availabilityPatches$ emission lands, and in WS-real mode that first
  // emission is a genuine round-trip (availability$ emits nothing until
  // JARVIS_AVAILABILITY replies, unbounded while the socket is still
  // connecting — WsAdapter buffers pre-open sends, so a send() in that
  // window is real, not hypothetical). Seeding this with the scripted-only
  // shape would silently pin brain:"scripted" onto that first turn even
  // though the desk's real brain roster hasn't been ruled out yet — the
  // server honors the brain a keyed turn carries, so the user would get a
  // canned scripted reply instead of the real model. Sim mode is
  // unaffected: `availabilitySource$`'s `of(DEFAULT_AVAILABILITY)` fallback
  // still emits synchronously and corrects this cache (see
  // availabilityPatches$ below) before the machine is even returned to the
  // caller, well before any send() can fire.
  let available = true;
  let availability: JarvisAvailability = {
    available: true,
    brains: JARVIS_BRAINS,
    defaultBrain: DEFAULT_JARVIS_BRAIN,
    gate: null,
  };
  let preferredBrain: JarvisBrain = DEFAULT_JARVIS_BRAIN;
  let effectiveBrain: JarvisBrain = INITIAL.effectiveBrain;
  let effort: JarvisEffort = DEFAULT_JARVIS_EFFORT;

  const send$ = new Subject<string>();
  const narrate$ = new Subject<string>();
  const open$ = new Subject<void>();
  const close$ = new Subject<void>();
  const toggle$ = new Subject<void>();
  const approve$ = new Subject<void>();
  const decline$ = new Subject<void>();
  const driveOutcome$ = new Subject<DriveOutcome>();

  let nextEntryId = 1; // 0 is the greeting entry

  // send() and narrate() feed the SAME queue — merged upstream of concatMap
  // so a narrate() arriving mid-send queues behind it (and vice versa), per
  // JarvisIntents.narrate's doc.
  const turnRequests$: Observable<TurnRequest> = merge(
    send$.pipe(
      map((text): TurnRequest => {
        return { kind: "send", text };
      }),
    ),
    narrate$.pipe(
      map((prompt): TurnRequest => {
        return { kind: "narrate", prompt };
      }),
    ),
  );

  // Turns run sequentially: concatMap only advances to the next queued
  // request once the previous turn's port.ask() observable has completed.
  // share() is required here — entryPatches$ and confirmRequests$ below are
  // two independent consumers, and without it each would trigger its own
  // subscription (and its own port.ask() call + entry-id allocation).
  const turnItems$: Observable<TurnItem> = turnRequests$.pipe(
    concatMap((req) => {
      // Unavailable → silent no-op: no user entry appended (the "start"
      // item below is never built) and port.ask is never called.
      if (!available) {
        return EMPTY;
      }

      const origin: "narrator" | undefined =
        req.kind === "narrate" ? "narrator" : undefined;
      // narrate()'s wire text is the prompt AS GIVEN (prefix included, per
      // JarvisIntents.narrate's doc); the transcript's display text strips
      // it. send()'s text is used verbatim for both.
      const wireText = req.kind === "narrate" ? req.prompt : req.text;
      const displayText =
        req.kind === "narrate" ? stripNarrationPrefix(req.prompt) : req.text;

      const userEntry: JarvisEntry = {
        id: nextEntryId++,
        role: "user",
        text: displayText,
        done: true,
        ...(origin ? { origin } : {}),
      };

      const jarvisEntry: JarvisEntry = {
        id: nextEntryId++,
        role: "jarvis",
        text: "",
        done: false,
      };
      return concat(
        of<TurnItem>({ kind: "start", userEntry, jarvisEntry }),
        deps.port.ask(wireText, { brain: effectiveBrain, effort }).pipe(
          map((event): TurnItem => {
            return { kind: "event", event, origin };
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

      return eventPatch(item.event, item.origin);
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

  const confirmRequests$: Observable<ConfirmRequestEvent> = events$.pipe(
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
        return { ...s, open: true, unread: 0, unreadNarration: false };
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
        return {
          ...s,
          open,
          unread: open ? 0 : s.unread,
          unreadNarration: open ? false : s.unreadNarration,
        };
      };
    }),
  );

  // recordDriveOutcome's fold — see JarvisIntents.recordDriveOutcome's doc
  // for why the applied-only filter lives HERE rather than at the
  // outcomes$ source. nextEntryId is the SAME counter turnItems$'s concatMap
  // above allocates from — ids just need to be unique, not contiguous
  // within one source.
  const driveOutcomePatches$: Observable<Patch> = driveOutcome$.pipe(
    filter((outcome) => {
      return outcome.status === "applied";
    }),
    map((outcome): Patch => {
      const entry: JarvisEntry = {
        id: nextEntryId++,
        role: "jarvis",
        text: `drive: ${outcome.command.kind}`,
        done: true,
      };

      return (s: JarvisState): JarvisState => {
        return { ...s, entries: [...s.entries, entry] };
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
  // `available`/`availability` caches that turnItems$'s concatMap reads
  // synchronously. Also re-resolves `effectiveBrain` — an availability flip
  // can un-offer the currently-preferred brain mid-session, so this must
  // recompute it here too, not only on preferredBrain$'s own emissions.
  const availabilityPatches$: Observable<Patch> = availabilitySource$.pipe(
    map((value): Patch => {
      available = value.available;
      availability = value;
      effectiveBrain = resolveEffectiveBrain(preferredBrain, availability);

      return (s: JarvisState): JarvisState => {
        return {
          ...s,
          available: value.available,
          brains: value.brains,
          effectiveBrain,
        };
      };
    }),
  );

  // The single live subscriber of deps.preferredBrain$ (via stream$'s `warm`
  // subscription below): refreshes the `preferredBrain` cache and
  // re-resolves `effectiveBrain` against the CURRENT availability cache — a
  // preference change mid-session must be reflected in the very next
  // send(), per JarvisState.effectiveBrain's doc.
  const preferredBrainPatches$: Observable<Patch> = deps.preferredBrain$.pipe(
    map((value): Patch => {
      preferredBrain = value;
      effectiveBrain = resolveEffectiveBrain(preferredBrain, availability);

      return (s: JarvisState): JarvisState => {
        return { ...s, effectiveBrain };
      };
    }),
  );

  // effort$ has no visible JarvisState field of its own (see
  // JarvisDeps.effort$'s doc) — only ask()'s wire payload reads the cache —
  // so this is a plain side-channel subscription rather than a patch folded
  // into stream$'s scan, torn down alongside the other subscriptions in
  // dispose() below.
  const effortSubscription = deps.effort$.subscribe((value) => {
    effort = value;
  });

  const stream$ = merge(
    entryPatches$,
    timerPatches$,
    approvePatches$,
    declinePatches$,
    openPatches$,
    closePatches$,
    togglePatches$,
    driveOutcomePatches$,
    skinPatches$,
    availabilityPatches$,
    preferredBrainPatches$,
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
        send$.next(text);
      },
      narrate: (prompt: string) => {
        narrate$.next(prompt);
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
      send$.complete();
      narrate$.complete();
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
