import {
  type Inbound,
  matchType,
  type Outbound,
  out,
  stream,
  type WsEffect,
} from "@better-software/rx-ws-effects";
import {
  catchError,
  concat,
  concatMap,
  defer,
  distinctUntilChanged,
  EMPTY,
  finalize,
  from,
  map,
  merge,
  type Observable,
  of,
  switchMap,
} from "rxjs";

import {
  isJarvisBrain,
  isJarvisEffort,
  isJarvisOwnBrain,
  JARVIS_HISTORY_ENTRY_MAX_CHARS,
  JARVIS_HISTORY_MAX_ENTRIES,
  JARVIS_KEY_MAX_CHARS,
  JARVIS_MESSAGE_MAX_CHARS,
  JARVIS_OWN_CAP_MAX_USD,
  JARVIS_OWN_PROVIDERS,
  JARVIS_PROVIDER_NAMES,
  type JarvisBrain,
  type JarvisBudgetView,
  type JarvisEvent,
  type JarvisHistoryEntry,
  type JarvisHouseBrain,
  type JarvisLiveBrain,
  type JarvisOwnBrain,
  type JarvisOwnKeyStatus,
  type JarvisOwnKeyView,
  type JarvisProvider,
  ownModelOf,
  ownModelsFor,
} from "@rtc/domain";
import {
  CLIENT_MSG,
  type JarvisAvailabilityPayload,
  type JarvisCancelPayload,
  type JarvisChatPayload,
  type JarvisConfirmPayload,
  type JarvisKeyPayload,
  SERVER_MSG,
} from "@rtc/shared";

import {
  type AgentSession,
  DESK_LINK_FALTERED_MESSAGE,
  describeRefusedKey,
  describeSdkErrorForLogging,
  type JarvisLoops,
  type OwnKeyFailureSink,
  type OwnKeyLoopBuilder,
} from "../agent/agentLoop.js";
import {
  type BudgetState,
  type OwnBudgetState,
  spendOwnerOf,
  type TurnMeter,
} from "../services/jarvisBudget/JarvisBudgetService.js";
import {
  houseBrainsFor,
  type JarvisTier,
} from "../services/jarvisBudget/jarvisTier.js";
import { ConnectionOwnKey } from "../services/ownKey/ConnectionOwnKey.js";
import type { Caller } from "../services/serviceContainer.js";
import type { JarvisTokenUsage } from "../services/UsageMeter.js";
import {
  type ConnectionBudget,
  readConnectionBudget,
} from "./connectionBudget.js";
import type { Ctx } from "./context.js";

/** SERVER_MSG for each `JarvisEvent` variant — the wire rule documented in
 * `@rtc/shared`'s `jarvis/jarvisPayloads.ts`: the payload IS the variant
 * minus its `type` discriminant plus a correlating `turnId`, so only the
 * message type itself needs a lookup. */
const WIRE_TYPE_BY_EVENT: Record<JarvisEvent["type"], string> = {
  brain: SERVER_MSG.JARVIS_BRAIN,
  delta: SERVER_MSG.JARVIS_DELTA,
  toolEvent: SERVER_MSG.JARVIS_TOOL_EVENT,
  confirmRequest: SERVER_MSG.JARVIS_CONFIRM_REQUEST,
  panel: SERVER_MSG.JARVIS_PANEL,
  command: SERVER_MSG.JARVIS_COMMAND,
  done: SERVER_MSG.JARVIS_DONE,
  error: SERVER_MSG.JARVIS_ERROR,
};

/* The `JarvisChatPayload` caps (`JARVIS_MESSAGE_MAX_CHARS` — S6, the message
 * itself was the one uncapped string on this frame — plus
 * `JARVIS_HISTORY_ENTRY_MAX_CHARS` and `JARVIS_HISTORY_MAX_ENTRIES`) come
 * from `@rtc/domain`, so the clients shorten to exactly what is enforced
 * here. The trust boundary for wire-supplied history still sits here, at the
 * parse seam, before it ever reaches an `AgentSession` and an Anthropic
 * request's token cost. They are wire-payload bounds, not runtime tuning. */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHistoryEntry(value: unknown): value is JarvisHistoryEntry {
  return (
    isRecord(value) &&
    (value.role === "user" || value.role === "jarvis") &&
    typeof value.text === "string" &&
    value.text.length <= JARVIS_HISTORY_ENTRY_MAX_CHARS
  );
}

/** Keeps only the most recent `JARVIS_HISTORY_MAX_ENTRIES` entries —
 * the tail, not the head, because the newest turns are the ones still
 * relevant to the model; an over-long history silently drops its oldest
 * context instead of being rejected outright. */
function truncateHistory(
  history: readonly JarvisHistoryEntry[],
): readonly JarvisHistoryEntry[] {
  return history.length > JARVIS_HISTORY_MAX_ENTRIES
    ? history.slice(-JARVIS_HISTORY_MAX_ENTRIES)
    : history;
}

/** Best-effort `turnId` extraction from an otherwise-malformed `jarvis.chat`
 * payload, so a `JARVIS_ERROR` can still be correlated back to the turn that
 * sent it. `undefined` when the payload doesn't even carry a string
 * `turnId`, in which case the message is dropped instead. */
function extractTurnId(payload: unknown): string | undefined {
  return isRecord(payload) && typeof payload.turnId === "string"
    ? payload.turnId
    : undefined;
}

/** Summarizes a dropped, malformed inbound frame for a `console.warn` site
 * WITHOUT ever including the payload body itself — an authenticated
 * connection can otherwise flood the server log with arbitrary attacker-
 * chosen content on every malformed `jarvis.*` frame it sends, and there is
 * only the `ws` `maxPayload` cap (S1) upstream of this to bound it. `frameType` is the
 * `CLIENT_MSG.JARVIS_*` wire constant; `turnId` is best-effort (via
 * `extractTurnId`) since a malformed frame may not carry one. */
function describeMalformedFrame(frameType: string, payload: unknown): string {
  const turnId = extractTurnId(payload);
  return `type=${frameType} turnId=${turnId ?? "<none>"} payload omitted`;
}

/** A listed brain as it is. Anything else starting `own:` was meant for a
 * person's own key — a model that left the list, a provider or shape this
 * server does not know — so it runs scripted: absent would mean the routing
 * default, a house brain, and the house key must not pay for this turn. */
function parseBrain(brain: unknown): JarvisBrain | undefined {
  if (isJarvisBrain(brain)) {
    return brain;
  }

  return typeof brain === "string" && brain.startsWith("own:")
    ? "scripted"
    : undefined;
}

/**
 * `text`/`turnId`/`history` stay strict (malformed → the whole frame is
 * rejected, per the JARVIS_ERROR/drop paths below). `brain`/`effort`/`origin`
 * are OPTIONAL wire fields with a well-defined fallback (the routing default,
 * the session's own default, the person's own turn), so an invalid or absent
 * value is treated as simply absent rather than failing the frame — a stale
 * client sending an unrecognized `brain` string still gets served, just on
 * the default brain. An `own:` string is not such a stale client: see
 * `parseBrain`.
 */
function parseChatPayload(payload: unknown): JarvisChatPayload | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const { text, turnId, history, brain, effort, origin } = payload;

  if (typeof text !== "string" || typeof turnId !== "string") {
    return undefined;
  }

  if (text.length > JARVIS_MESSAGE_MAX_CHARS) {
    return undefined;
  }

  if (
    history !== undefined &&
    (!Array.isArray(history) || !history.every(isHistoryEntry))
  ) {
    return undefined;
  }

  return {
    text,
    turnId,
    history:
      history === undefined
        ? undefined
        : truncateHistory(history as readonly JarvisHistoryEntry[]),
    brain: parseBrain(brain),
    effort: isJarvisEffort(effort) ? effort : undefined,
    origin: origin === "narrator" ? "narrator" : "user",
  };
}

function parseConfirmPayload(
  payload: unknown,
): JarvisConfirmPayload | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const { confirmationId, approved } = payload;

  if (typeof confirmationId !== "string" || typeof approved !== "boolean") {
    return undefined;
  }

  return { confirmationId, approved };
}

function parseCancelPayload(payload: unknown): JarvisCancelPayload | undefined {
  return isRecord(payload) && typeof payload.turnId === "string"
    ? { turnId: payload.turnId }
    : undefined;
}

function isOfferedProvider(value: unknown): value is JarvisProvider {
  return (JARVIS_OWN_PROVIDERS as readonly unknown[]).includes(value);
}

/** `spentUsd >= NaN` is false, so an unchecked cap could never be reached. */
function isOwnCap(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value > 0 &&
      value <= JARVIS_OWN_CAP_MAX_USD)
  );
}

/** The trust boundary for a person's own key: only a provider from the closed
 * set, a bounded key and a real cap get past here. The caller logs a
 * rejection with `describeMalformedFrame`, never the payload. */
function parseKeyPayload(payload: unknown): JarvisKeyPayload | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  if (payload.action === "clear") {
    return { action: "clear" };
  }

  const { action, provider, key, capUsd } = payload;

  if (
    action !== "set" ||
    !isOfferedProvider(provider) ||
    typeof key !== "string" ||
    key.length > JARVIS_KEY_MAX_CHARS ||
    !isOwnCap(capUsd)
  ) {
    return undefined;
  }

  return { action, provider, key, capUsd };
}

/** What one connection may pick on the house key right now, and what a spent
 * budget took away from that. */
interface ConnectionOffer {
  readonly brains: readonly JarvisHouseBrain[];
  readonly defaultBrain: JarvisHouseBrain;
  /** Empty while the budget lasts. */
  readonly gated: readonly JarvisHouseBrain[];
}

/** A connection with no signed-in caller has no one to meter, so neither the
 * house key nor an own key is offered to it (only the shared container lacks
 * a caller; every real socket is scoped with one). */
const SCRIPTED_ONLY_OFFER: ConnectionOffer = {
  brains: ["scripted"],
  defaultBrain: "scripted",
  gated: [],
};

/**
 * The offer for one budget reading (spec §3.1, D5): what this process can
 * serve (`loops.brains`) narrowed to what the caller's tier gets on the house
 * key, in picker order. Once the budget is spent only the scripted brain
 * stays, and `gated` lists what was taken — the existing hard-gate shape, so
 * the clients render it unchanged.
 */
function offerFor(
  loops: JarvisLoops,
  budget: ConnectionBudget | null,
): ConnectionOffer {
  if (budget === null) {
    return SCRIPTED_ONLY_OFFER;
  }

  const houseBrains = houseBrainsFor(budget.tier);
  const brains = loops.brains.filter((brain) => {
    return houseBrains.includes(brain);
  });

  if (budget.state.exhausted !== null) {
    return {
      brains: ["scripted"],
      defaultBrain: "scripted",
      gated: brains.filter((brain) => {
        return brain !== "scripted";
      }),
    };
  }

  return {
    brains,
    defaultBrain: brains.includes(loops.defaultBrain)
      ? loops.defaultBrain
      : "scripted",
    gated: [],
  };
}

/** A person's own key as this connection knows it, with its budget. */
interface ConnectionOwn {
  readonly view: JarvisOwnKeyView;
  readonly budget: OwnBudgetState;
}

/** What an own key adds to the offer, and what its spent cap took away. */
interface OwnOffer {
  readonly brains: readonly JarvisOwnBrain[];
  readonly gated: readonly JarvisOwnBrain[];
}

const NO_OWN_OFFER: OwnOffer = { brains: [], gated: [] };

/** A key reading these can still be picked: `checking` waits for the answer
 * and `refused` fails the turn naming the provider. `unreachable` and
 * `limited` were never judged, so the frame says why instead. */
const OFFERED_KEY_STATUSES: ReadonlySet<JarvisOwnKeyStatus> = new Set([
  "checking",
  "accepted",
  "refused",
]);

function ownOfferFor(own: ConnectionOwn | null): OwnOffer {
  if (own === null || !OFFERED_KEY_STATUSES.has(own.view.status)) {
    return NO_OWN_OFFER;
  }

  const brains = ownModelsFor(own.view.provider).map((model) => {
    return model.brain;
  });

  return own.budget.exhausted === null
    ? { brains, gated: [] }
    : { brains: [], gated: brains };
}

function budgetViewOf(state: BudgetState): JarvisBudgetView {
  return {
    keyKind: "house",
    spentUsd: state.spentUsd,
    limitUsd: state.limitUsd,
    exhausted: state.exhausted,
    resetsAtMs: state.resetsAtMs,
  };
}

function ownBudgetViewOf(state: OwnBudgetState): JarvisBudgetView {
  return {
    keyKind: "own",
    spentUsd: state.spentUsd,
    limitUsd: state.limitUsd,
    exhausted: state.exhausted,
    resetsAtMs: state.resetsAtMs,
  };
}

/** Builds the `JARVIS_AVAILABILITY` payload for one reading of the budgets
 * (`budget` null: no caller to read one for; `own` null: no key set). `gate`
 * is present only while a budget is spent — the wire rule on
 * `JarvisAvailabilityGate`: "none" never crosses the wire — and lists what
 * each spent budget removed. */
function buildAvailabilityPayload(
  loops: JarvisLoops,
  budget: ConnectionBudget | null,
  own: ConnectionOwn | null,
): JarvisAvailabilityPayload {
  const offer = offerFor(loops, budget);

  if (budget === null) {
    return {
      available: true,
      brains: offer.brains,
      defaultBrain: offer.defaultBrain,
    };
  }

  const ownOffer = ownOfferFor(own);
  const isGated = budget.state.exhausted !== null || ownOffer.gated.length > 0;

  return {
    available: true,
    brains: [...offer.brains, ...ownOffer.brains],
    defaultBrain: offer.defaultBrain,
    ...(isGated
      ? {
          gate: {
            level: "hard",
            resetsAtMs: budget.state.resetsAtMs,
            gated: [...offer.gated, ...ownOffer.gated],
          },
        }
      : {}),
    budget: budgetViewOf(budget.state),
    ...(own === null
      ? {}
      : { ownBudget: ownBudgetViewOf(own.budget), ownKey: own.view }),
  };
}

/** One reading of everything the availability frame reports. */
interface ConnectionReading {
  readonly budget: ConnectionBudget;
  readonly own: ConnectionOwn | null;
}

async function readConnectionOwn(
  ctx: Ctx,
  caller: Caller,
  ownKey: ConnectionOwnKey,
): Promise<ConnectionOwn | null> {
  const view = ownKey.view();

  return view === null
    ? null
    : {
        view,
        budget: await ctx.jarvisBudget.ownStateFor(caller, view.capUsd),
      };
}

async function readConnection(
  ctx: Ctx,
  caller: Caller,
  ownKey: ConnectionOwnKey,
): Promise<ConnectionReading> {
  const [budget, own] = await Promise.all([
    readConnectionBudget(ctx, caller),
    readConnectionOwn(ctx, caller, ownKey),
  ]);

  return { budget, own };
}

/** What an own-brain turn is checked against: waits out any check of the key
 * first, then loads the own copy of today's spend, which the turn's meter
 * needs. Null unless the key is accepted. */
async function readOwnTurnBudget(
  ctx: Ctx,
  caller: Caller,
  ownKey: ConnectionOwnKey,
): Promise<OwnBudgetState | null> {
  await ownKey.settled();

  const view = ownKey.view();

  return view?.status === "accepted"
    ? ctx.jarvisBudget.ownStateFor(caller, view.capUsd)
    : null;
}

/** Two payloads are the same frame when they serialize alike: every payload
 * is built by `buildAvailabilityPayload` in one key order, from plain data. */
function isSamePayload(
  previous: JarvisAvailabilityPayload,
  next: JarvisAvailabilityPayload,
): boolean {
  return JSON.stringify(previous) === JSON.stringify(next);
}

/** The meter a house turn's session records into: the caller's budget first
 * (the enforcement, so a failing display can never skip it), then the Ops
 * usage display. Reservations are the budget's alone. An own turn never gets
 * this meter: `runOwnTurn` builds its own and `runTurnFor` takes house brains
 * only. The check on `record` is what lets this compile without a bivariant
 * parameter, and the usage display counts the house key alone. */
function createHouseTurnMeter(
  ctx: Ctx,
  caller: Caller,
  tier: JarvisTier,
): TurnMeter {
  const budgetMeter = ctx.jarvisBudget.meterFor(caller, tier);

  return {
    beginRequest: (brain: JarvisLiveBrain, ceiling: JarvisTokenUsage): void => {
      budgetMeter.beginRequest(brain, ceiling);
    },
    record: (brain: JarvisLiveBrain, usage: JarvisTokenUsage): void => {
      budgetMeter.record(brain, usage);

      if (!isJarvisOwnBrain(brain)) {
        ctx.usageMeter.recordTokens(brain, usage);
      }
    },
    endRequest: (): void => {
      budgetMeter.endRequest();
    },
    exhausted: (): boolean => {
      return budgetMeter.exhausted();
    },
  };
}

/** A session on a person's own key, good for one key: a change of key
 * retires it, and `keyFailure` does nothing from then on. */
interface OwnSession {
  readonly session: AgentSession;
  readonly keyFailure: OwnKeyFailureSink;
  /** The `ConnectionOwnKey.keyGeneration` it was built under. */
  readonly generation: number;
}

/**
 * Produces the JARVIS_* wire effect, closing over the given `loops`.
 *
 * One effect, because availability and turns share one `ConnectionOwnKey`:
 * `createWsListener` invokes it once per socket, and the key, whatever
 * sessions the socket opens and the availability observer all live in that
 * one closure, and go in its `finalize`. A connection with no caller has no
 * `ConnectionOwnKey`, so a `jarvis.key` frame there is ignored.
 *
 * `JARVIS_SUBSCRIBE` always gets an answer, so the client's handshake never
 * hangs. The payload is per connection (spec §3.8): `brains`/`defaultBrain`
 * are what `JarvisLoops` can serve narrowed to the caller's tier, and to the
 * scripted brain alone once the caller's budget is spent, with the budget
 * itself alongside, plus the brains of an own key with its status and budget
 * — see `buildAvailabilityPayload`. Each live observer re-reads on every
 * `ctx.jarvisBudget.changes$` (a spend by anyone, a store outage or recovery,
 * the day changing at 00:00 UTC) and every `ownKey.changes$` (a key set,
 * answered, refused or cleared), so a spend in another tab or the midnight
 * lift re-pushes a fresh frame without the client re-sending
 * `JARVIS_SUBSCRIBE`; `distinctUntilChanged` drops the readings that leave
 * this caller's frame as it was, such as someone else's spend.
 *
 * Hand-rolled with `switchMap` rather than the generic `stream()` helper
 * (which is hardwired to `mergeMap`, same reason `jarvisChat$` below is
 * hand-rolled too): `changes$` never completes, so a `mergeMap`'d inner
 * observer never tears down on its own. A reconnecting or double-firing
 * client sending `JARVIS_SUBSCRIBE` more than once on the SAME socket would
 * otherwise accumulate one permanent observer per frame — N duplicate
 * `JARVIS_AVAILABILITY` pushes per change, and an ever-growing subscriber
 * list on the shared `JarvisBudgetService` for the life of the process.
 * `switchMap` instead unsubscribes the previous observer the moment a new
 * `JARVIS_SUBSCRIBE` arrives, so a socket holds at most one live observer
 * regardless of how many subscribe frames it sends (latest-subscribe-wins) —
 * and since every observer starts with a reading of its own, a connection
 * that subscribes while already spent gets the gated payload in its very
 * first frame.
 *
 * A turn reads the budget before it is routed (spec §3.3), and an own-brain
 * turn first waits for any check of the key: both waits sit inside the
 * `concatMap` queue, so turns stay serialized, and a cancel that lands while
 * one is pending keeps that turn from starting at all.
 *
 * Routing, after those waits (spec §5.4, D13, D15, D19):
 *
 * | Asked for | State | Runs |
 * |---|---|---|
 * | own brain | key accepted, cap not spent | that brain, own meter |
 * | own brain | key refused | an error naming the provider, no provider call |
 * | own brain | no key, unreachable, limited, other provider, unlisted model, cap spent | scripted, never a house brain |
 * | house brain | | as `routeTurn` says |
 *
 * An own brain is settled by `routeOwnTurn` alone, and nothing there can
 * reach a house loop: a person's turn never spends the house key because
 * their own key is missing, spent or refused.
 *
 * The session effect is a factory rather than a constant `WsEffect[]` (like
 * `fxEffects`): each `AgentLoop.createSession()` call runs inside the effect
 * body itself, which `createWsListener` invokes once per socket — so every
 * connection gets its own `AgentSession`(s) with their own pending-
 * confirmation state, the P3 fix for the P2 cross-socket confirmation-forgery
 * risk. `loops.scripted`, `loops.anthropic` and the own-key loop are each
 * lazily sessioned on FIRST use by that connection: a connection that only
 * ever picks scripted brains never calls `loops.anthropic.createSession()`
 * (no wasted Anthropic client-side session state), and vice versa.
 */
export function jarvisEffects(
  loops: JarvisLoops,
  buildOwnKeyLoop: OwnKeyLoopBuilder,
): WsEffect<Ctx>[] {
  function jarvisConnectionEffect(
    in$: Observable<Inbound>,
    ctx: Ctx,
  ): Observable<Outbound> {
    const ownKey =
      ctx.caller === null
        ? null
        : new ConnectionOwnKey({
            verify: ctx.verifyOwnKey,
            limiter: ctx.ownKeyChecks,
            identity: spendOwnerOf(ctx.caller),
          });

    /** One subscriber's frames: the first at once, then one per change to
     * what this caller is offered. */
    function projectAvailability(): Observable<Outbound> {
      const caller = ctx.caller;

      if (caller === null || ownKey === null) {
        return of(
          out(
            SERVER_MSG.JARVIS_AVAILABILITY,
            buildAvailabilityPayload(loops, null, null),
          ),
        );
      }

      return merge(
        of(undefined),
        ctx.jarvisBudget.changes$,
        ownKey.changes$,
      ).pipe(
        switchMap((): Observable<ConnectionReading> => {
          return from(readConnection(ctx, caller, ownKey));
        }),
        map(({ budget, own }): JarvisAvailabilityPayload => {
          return buildAvailabilityPayload(loops, budget, own);
        }),
        distinctUntilChanged(isSamePayload),
        map((payload): Outbound => {
          return out(SERVER_MSG.JARVIS_AVAILABILITY, payload);
        }),
        catchError((err: unknown): Observable<never> => {
          console.error("ws-effects: stream effect error", err);
          return EMPTY;
        }),
      );
    }

    function availability$(): Observable<Outbound> {
      return in$.pipe(
        matchType(CLIENT_MSG.JARVIS_SUBSCRIBE),
        switchMap((): Observable<Outbound> => {
          return projectAvailability();
        }),
      );
    }

    // Lazily created on first use — see the laziness note on `jarvisEffects`
    // above. `null` means "not yet created for this connection", not "no
    // loop available" (that's `loops.anthropic === null`, checked separately
    // in `runTurnFor`).
    let scriptedSession: AgentSession | null = null;
    let anthropicSession: AgentSession | null = null;
    // The current key's session; every change of key retires it.
    let ownSession: OwnSession | null = null;

    function getScriptedSession(): AgentSession {
      scriptedSession ??= loops.scripted.createSession();
      return scriptedSession;
    }

    /** `null` only when `loops.anthropic` itself is `null` — no live Claude
     * model wired for this process at all. */
    function getAnthropicSession(): AgentSession | null {
      if (!loops.anthropic) {
        return null;
      }

      anthropicSession ??= loops.anthropic.createSession();
      return anthropicSession;
    }

    /** The current key's session, built on first use. `null` unless the key
     * is accepted: the key leaves `ConnectionOwnKey` only here. */
    function getOwnSession(connectionKey: ConnectionOwnKey): OwnSession | null {
      ownSession ??= connectionKey.use(
        (provider: JarvisProvider, key: string): OwnSession => {
          const built: OwnSession = {
            session: buildOwnKeyLoop(provider, key).createSession(),
            generation: connectionKey.keyGeneration,
            keyFailure: {
              providerName: JARVIS_PROVIDER_NAMES[provider],
              // Tied to this session: a 401 from a turn on an old key, landing
              // after a newer key was accepted, must not refuse the new one.
              refused: (): void => {
                if (ownSession === built) {
                  connectionKey.markRefused();
                }
              },
            },
          };

          return built;
        },
      );

      return ownSession;
    }

    /** Cancels a running own turn, then lets the session go. Dropped from
     * `ownSession` first, so nothing the cancel sets off counts as current. */
    function retireOwnSession(): void {
      const retired = ownSession;

      ownSession = null;
      retired?.session.cancelTurn();
      retired?.session.dispose();
    }

    /** `payload.brain` if it's both a recognized brain AND one of the
     * brains the connection's current offer actually includes, else
     * `offer.defaultBrain` — the same "invalid/un-offered input silently
     * falls back to the default" posture as the parse seam above, not a
     * rejected frame. Pure over `offer` (not `ctx`/`loops`) so the budget is
     * read exactly once per turn at the call site, keeping this function
     * trivially testable and free of hidden reads. House turns only: an own
     * brain never gets here, and the result is a house brain. */
    function resolveBrain(
      offer: ConnectionOffer,
      payload: JarvisChatPayload,
    ): JarvisHouseBrain {
      // Find, not `includes`: the match comes back typed as the house brain.
      return (
        offer.brains.find((brain) => {
          return brain === payload.brain;
        }) ?? offer.defaultBrain
      );
    }

    /** Opens a turn's event stream with the brain that actually runs it, so
     * the client can tag the reply with it (spec §4.2) — the server may have
     * resolved a different brain than the one the client asked for. */
    function stampWithBrain(
      brain: JarvisBrain,
      events$: Observable<JarvisEvent>,
    ): Observable<JarvisEvent> {
      return concat(of<JarvisEvent>({ type: "brain", brain }), events$);
    }

    function runTurnFor(
      brain: JarvisHouseBrain,
      payload: JarvisChatPayload,
      meter: TurnMeter | undefined,
    ): Observable<JarvisEvent> {
      // Once per turn that actually starts: this runs when the concatMap
      // queue reaches the turn and its budget read is in, not at frame
      // arrival — a frame still queued when the socket closes, or cancelled
      // before it started, is never counted (it never ran). A started turn
      // that errors or gets cancelled mid-stream still counts against the
      // brain it was routed to.
      ctx.usageMeter.recordTurn(brain);

      const history = payload.history ?? [];

      if (brain === "scripted") {
        return stampWithBrain(
          "scripted",
          getScriptedSession().runTurn(payload.text, history),
        );
      }

      const session = getAnthropicSession();

      if (!session) {
        // Cannot happen by construction: `resolveBrain` only ever returns a
        // real-model brain when it's a member of the offer's `brains`,
        // itself a subset of `loops.brains` — and that set only ever lists
        // real models when `loops.anthropic` is non-null (see
        // `createJarvisLoops`). Defended anyway, with a sanitized log (brain
        // id only, never the turn's text/history).
        console.error(
          `jarvis.chat: resolved brain "${brain}" has no live anthropic session; falling back to scripted`,
        );
        return stampWithBrain(
          "scripted",
          getScriptedSession().runTurn(payload.text, history),
        );
      }

      return stampWithBrain(
        brain,
        session.runTurn(payload.text, history, {
          brain,
          effort: payload.effort,
          meter,
        }),
      );
    }

    /** Runs a turn on the person's own key, which pays: no house budget,
     * no usage meter, and a failure reports to the session's sink. */
    function runOwnTurn(
      brain: JarvisOwnBrain,
      readCapUsd: () => number | null,
      caller: Caller,
      session: OwnSession,
      payload: JarvisChatPayload,
    ): Observable<JarvisEvent> {
      return stampWithBrain(
        brain,
        session.session.runTurn(payload.text, payload.history ?? [], {
          brain,
          effort: payload.effort,
          meter: ctx.jarvisBudget.ownMeterFor(caller, readCapUsd),
          keyFailure: session.keyFailure,
        }),
      );
    }

    /** Settles an own-brain turn, narrator turns included (D19): the table
     * on `jarvisEffects`. Read after the waits, in one synchronous step, so
     * the key this looks at is the key the session is built on. */
    function routeOwnTurn(
      brain: JarvisOwnBrain,
      parsed: JarvisChatPayload,
      caller: Caller,
      connectionKey: ConnectionOwnKey,
    ): Observable<JarvisEvent> {
      return from(readOwnTurnBudget(ctx, caller, connectionKey)).pipe(
        concatMap((budget): Observable<JarvisEvent> => {
          if (cancelledTurnId === parsed.turnId) {
            return EMPTY;
          }

          const model = ownModelOf(brain);
          const view = connectionKey.view();

          // No listed model, no own turn: its cost could not be metered.
          if (
            model === undefined ||
            view === null ||
            view.provider !== model.provider
          ) {
            return runTurnFor("scripted", parsed, undefined);
          }

          if (view.status === "refused") {
            return of<JarvisEvent>({
              type: "error",
              message: describeRefusedKey(JARVIS_PROVIDER_NAMES[view.provider]),
            });
          }

          const session =
            view.status === "accepted" && budget?.exhausted === null
              ? getOwnSession(connectionKey)
              : null;

          const lastCapUsd = view.capUsd;

          // The live cap, so a change mid-turn counts from the next request.
          // Key gone: the session is being retired, so the last cap stands.
          function readCapUsd(): number | null {
            const current = connectionKey.view();

            return current === null ? lastCapUsd : current.capUsd;
          }

          return session === null
            ? runTurnFor("scripted", parsed, undefined)
            : runOwnTurn(model.brain, readCapUsd, caller, session, parsed);
        }),
        // Inside the key's own path, ahead of `jarvisChat$`'s catch, which
        // logs the whole error: here it may be the provider's, and its
        // message may quote the request. Name and status only, and the turn
        // still ends for the client.
        catchError((err: unknown): Observable<JarvisEvent> => {
          console.error(
            "jarvis.chat: own-key turn failed —",
            describeSdkErrorForLogging(err),
          );

          return of<JarvisEvent>({
            type: "error",
            message: DESK_LINK_FALTERED_MESSAGE,
          });
        }),
      );
    }

    /** Routes a parsed turn and runs it. A connection with no caller runs
     * scripted at once with nothing to read or record. An own brain goes to
     * `routeOwnTurn`, whoever asked. A narrator turn on any other brain runs
     * scripted too (spec D19: the app's own commentary never spends the house
     * key). Every other turn reads the caller's budget first and is routed
     * against the offer that reading gives; a house brain gets a meter that
     * books each request and stops the turn once the budget is spent. */
    function routeTurn(parsed: JarvisChatPayload): Observable<JarvisEvent> {
      const caller = ctx.caller;

      if (caller === null || ownKey === null) {
        return runTurnFor("scripted", parsed, undefined);
      }

      if (isJarvisOwnBrain(parsed.brain)) {
        return routeOwnTurn(parsed.brain, parsed, caller, ownKey);
      }

      if (parsed.origin === "narrator") {
        return runTurnFor("scripted", parsed, undefined);
      }

      return from(readConnectionBudget(ctx, caller)).pipe(
        concatMap((budget): Observable<JarvisEvent> => {
          if (cancelledTurnId === parsed.turnId) {
            return EMPTY;
          }

          const brain = resolveBrain(offerFor(loops, budget), parsed);

          return runTurnFor(
            brain,
            parsed,
            brain === "scripted"
              ? undefined
              : createHouseTurnMeter(ctx, caller, budget.tier),
          );
        }),
      );
    }

    // The turnId of whichever turn is currently open — set at that turn's
    // subscribe time, cleared in its own `finalize`. `AgentSession.cancelTurn()`
    // is turnId-blind (it cancels whatever is running), so this is the
    // effect-layer gate that keeps a cancel from one turn from reaching a
    // DIFFERENT, later turn: the client sends `jarvis.cancel` on every
    // teardown including normal completion (see `AgentSession.cancelTurn`'s
    // doc comment), so a stale cancel for an already-finished turn arriving
    // after a new turn has started must be a silent no-op rather than
    // killing the new turn mid-stream.
    let inFlightTurnId: string | undefined;

    // The in-flight turn's id once a matching `jarvis.cancel` has arrived.
    // `cancelTurn()` only reaches a turn already running in a session; a
    // turn still waiting on its key or budget read checks this before it
    // starts.
    let cancelledTurnId: string | undefined;

    function projectChatTurn(payload: unknown): Observable<Outbound> {
      return defer((): Observable<Outbound> => {
        const parsed = parseChatPayload(payload);

        if (!parsed) {
          const turnId = extractTurnId(payload);

          if (!turnId) {
            console.warn(
              "jarvis.chat: dropping malformed payload",
              describeMalformedFrame(CLIENT_MSG.JARVIS_CHAT, payload),
            );
            return EMPTY;
          }

          return of(
            out(SERVER_MSG.JARVIS_ERROR, {
              turnId,
              message: "Malformed jarvis.chat payload.",
            }),
          );
        }

        inFlightTurnId = parsed.turnId;

        return routeTurn(parsed).pipe(
          map((event): Outbound => {
            const { type, ...body } = event;
            return out(WIRE_TYPE_BY_EVENT[type], {
              ...body,
              turnId: parsed.turnId,
            });
          }),
          finalize((): void => {
            if (inFlightTurnId === parsed.turnId) {
              inFlightTurnId = undefined;
            }

            if (cancelledTurnId === parsed.turnId) {
              cancelledTurnId = undefined;
            }
          }),
        );
      });
    }

    /**
     * Deliberately hand-rolled instead of the generic `stream()` helper:
     * `stream()` is hardwired to `mergeMap`, which would let two rapid
     * `jarvis.chat` frames on the same socket run CONCURRENTLY — turn B's
     * `confirmRequest` could then land on turn A's still-open wire stream
     * (both interleaved through the same `session`), the first turn to
     * finish would null the OTHER turn's `currentPush`/`currentAbort`
     * (`AnthropicAgentSession` is single-slot per session, not per turn),
     * and a stray `jarvis.cancel` could abort the wrong turn's controller.
     * `concatMap` queues turn B's projection until turn A's stream
     * completes — matching the client's own `JarvisMachine`, which already
     * serializes chat turns the same way. `inFlightTurnId` only becomes
     * "in flight" once a turn's stream actually subscribes, and `concatMap`
     * doesn't subscribe the next inner observable until the previous one
     * completes, so the turnId-correlation gate below still tracks exactly
     * one real in-flight turn at a time. The confirm/cancel sub-streams
     * stay on the ordinary `stream()` (still effectively merge-live): a
     * cancel or confirm must reach the CURRENTLY RUNNING turn immediately,
     * even while a second chat frame sits queued behind it.
     */
    function jarvisChat$(chatIn$: Observable<Inbound>): Observable<Outbound> {
      return chatIn$.pipe(
        matchType(CLIENT_MSG.JARVIS_CHAT),
        concatMap((msg) => {
          return projectChatTurn(msg.payload).pipe(
            catchError((err: unknown): Observable<never> => {
              console.error("ws-effects: stream effect error", err);
              return EMPTY;
            }),
          );
        }),
      );
    }

    /** Sets or clears the connection's own key. The key itself goes no
     * further than `ConnectionOwnKey`; a change of key retires the session
     * built on the old one, and a new cap on the same key leaves it running. */
    const jarvisKey$: WsEffect<Ctx> = stream(
      CLIENT_MSG.JARVIS_KEY,
      (payload): Observable<Outbound> => {
        return defer((): Observable<Outbound> => {
          if (ownKey === null) {
            return EMPTY;
          }

          const parsed = parseKeyPayload(payload);

          if (!parsed) {
            console.warn(
              "jarvis.key: dropping malformed payload",
              // No payload, not even for its `turnId`: this frame carries a
              // key, and any field of it may be where the key landed.
              describeMalformedFrame(CLIENT_MSG.JARVIS_KEY, undefined),
            );
            return EMPTY;
          }

          ownKey.apply(parsed);

          if (ownSession?.generation !== ownKey.keyGeneration) {
            retireOwnSession();
          }

          return EMPTY;
        });
      },
    );

    const jarvisConfirm$: WsEffect<Ctx> = stream(
      CLIENT_MSG.JARVIS_CONFIRM,
      (payload): Observable<Outbound> => {
        return defer((): Observable<Outbound> => {
          const parsed = parseConfirmPayload(payload);

          if (!parsed) {
            console.warn(
              "jarvis.confirm: dropping malformed payload",
              describeMalformedFrame(CLIENT_MSG.JARVIS_CONFIRM, payload),
            );
            return EMPTY;
          }

          // Forwarded to every session that EXISTS for this connection, not
          // "the" session — there are up to three per connection. Each
          // session's own `ownedConfirmationIds` guard (P3) means only
          // the session that actually issued this `confirmationId` acts on
          // it; the other's call is a harmless no-op. Never CREATES a
          // session just to deliver a confirm (would break the laziness
          // guarantee for a connection that never used that brain).
          scriptedSession?.resolveConfirmation(
            parsed.confirmationId,
            parsed.approved,
          );
          anthropicSession?.resolveConfirmation(
            parsed.confirmationId,
            parsed.approved,
          );
          ownSession?.session.resolveConfirmation(
            parsed.confirmationId,
            parsed.approved,
          );
          return EMPTY;
        });
      },
    );

    const jarvisCancel$: WsEffect<Ctx> = stream(
      CLIENT_MSG.JARVIS_CANCEL,
      (payload): Observable<Outbound> => {
        return defer((): Observable<Outbound> => {
          const parsed = parseCancelPayload(payload);

          if (!parsed) {
            console.warn(
              "jarvis.cancel: dropping malformed payload",
              describeMalformedFrame(CLIENT_MSG.JARVIS_CANCEL, payload),
            );
            return EMPTY;
          }

          // Stale/mismatched cancel (already-completed or never-started
          // turnId) — silent no-op, per the doc comment above. Forwarded to
          // every EXISTING session (same rationale as jarvis.confirm above):
          // only the session with the actually-running turn has anything to
          // cancel — `AgentSession.cancelTurn()` on an idle session is a
          // documented no-op.
          if (parsed.turnId === inFlightTurnId) {
            cancelledTurnId = parsed.turnId;
            scriptedSession?.cancelTurn();
            anthropicSession?.cancelTurn();
            ownSession?.session.cancelTurn();
          }

          return EMPTY;
        });
      },
    );

    return merge(
      availability$(),
      jarvisKey$(in$, ctx),
      jarvisChat$(in$),
      jarvisConfirm$(in$, ctx),
      jarvisCancel$(in$, ctx),
    ).pipe(
      finalize((): void => {
        // Only the sessions this connection actually created — never
        // conjures the other brain's session just to dispose it.
        scriptedSession?.dispose();
        anthropicSession?.dispose();
        retireOwnSession();
        ownKey?.dispose();
      }),
    );
  }

  return [jarvisConnectionEffect];
}
