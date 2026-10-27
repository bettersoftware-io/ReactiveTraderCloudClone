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
  type JarvisBrain,
  type JarvisBudgetView,
  type JarvisEvent,
  type JarvisHistoryEntry,
} from "@rtc/domain";
import {
  CLIENT_MSG,
  type JarvisAvailabilityPayload,
  type JarvisCancelPayload,
  type JarvisChatPayload,
  type JarvisConfirmPayload,
  SERVER_MSG,
} from "@rtc/shared";
import {
  type Inbound,
  matchType,
  type Outbound,
  out,
  stream,
  type WsEffect,
} from "@rtc/ws-effects";

import type { AgentSession, JarvisLoops } from "../agent/agentLoop.js";
import type {
  BudgetState,
  TurnMeter,
} from "../services/jarvisBudget/JarvisBudgetService.js";
import {
  houseBrainsFor,
  type JarvisTier,
} from "../services/jarvisBudget/jarvisTier.js";
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

/** `JarvisChatPayload.history` caps — the trust boundary for wire-supplied
 * history sits here, at the parse seam, before it ever reaches an
 * `AgentSession` (and, from Task 6, an Anthropic request's token cost).
 * Deliberately local to this module rather than imported from server config:
 * these are wire-payload bounds, not runtime tuning. */
const JARVIS_WIRE_HISTORY_MAX_ENTRIES = 20;
const JARVIS_WIRE_HISTORY_MAX_TEXT = 2_000;
/** S6 — the message itself was the one uncapped string on this frame. */
const JARVIS_WIRE_TEXT_MAX = 4_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHistoryEntry(value: unknown): value is JarvisHistoryEntry {
  return (
    isRecord(value) &&
    (value.role === "user" || value.role === "jarvis") &&
    typeof value.text === "string" &&
    value.text.length <= JARVIS_WIRE_HISTORY_MAX_TEXT
  );
}

/** Keeps only the most recent `JARVIS_WIRE_HISTORY_MAX_ENTRIES` entries —
 * the tail, not the head, because the newest turns are the ones still
 * relevant to the model; an over-long history silently drops its oldest
 * context instead of being rejected outright. */
function truncateHistory(
  history: readonly JarvisHistoryEntry[],
): readonly JarvisHistoryEntry[] {
  return history.length > JARVIS_WIRE_HISTORY_MAX_ENTRIES
    ? history.slice(-JARVIS_WIRE_HISTORY_MAX_ENTRIES)
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

/**
 * `text`/`turnId`/`history` stay strict (malformed → the whole frame is
 * rejected, per the JARVIS_ERROR/drop paths below). `brain`/`effort`/`origin`
 * are OPTIONAL wire fields with a well-defined fallback (the routing default,
 * the session's own default, the person's own turn), so an invalid or absent
 * value is treated as simply absent rather than failing the frame — a stale
 * client sending an unrecognized `brain` string still gets served, just on
 * the default brain.
 */
function parseChatPayload(payload: unknown): JarvisChatPayload | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const { text, turnId, history, brain, effort, origin } = payload;

  if (typeof text !== "string" || typeof turnId !== "string") {
    return undefined;
  }

  if (text.length > JARVIS_WIRE_TEXT_MAX) {
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
    brain: isJarvisBrain(brain) ? brain : undefined,
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

/** What one connection may pick right now, and what a spent budget took
 * away from that. */
interface ConnectionOffer {
  readonly brains: readonly JarvisBrain[];
  readonly defaultBrain: JarvisBrain;
  /** Empty while the budget lasts. */
  readonly gated: readonly JarvisBrain[];
}

/** A connection with no signed-in caller has no one to meter, so the house
 * key is not offered to it at all (only the shared container lacks a caller;
 * every real socket is scoped with one). */
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

function budgetViewOf(state: BudgetState): JarvisBudgetView {
  return {
    keyKind: "house",
    spentUsd: state.spentUsd,
    limitUsd: state.limitUsd,
    exhausted: state.exhausted,
    resetsAtMs: state.resetsAtMs,
  };
}

/** Builds the `JARVIS_AVAILABILITY` payload for one budget reading (`null`:
 * no caller to read one for). `loops === null` (no Jarvis at all — no
 * scripted fallback, no Anthropic key) short-circuits before the budget is
 * even consulted: there is nothing to offer, so nothing to gate. `gate` is
 * present only while the budget is spent — the wire rule on
 * `JarvisAvailabilityGate`: "none" never crosses the wire. */
function buildAvailabilityPayload(
  loops: JarvisLoops | null,
  budget: ConnectionBudget | null,
): JarvisAvailabilityPayload {
  if (loops === null) {
    return { available: false, brains: [], defaultBrain: "scripted" };
  }

  const offer = offerFor(loops, budget);

  if (budget === null) {
    return {
      available: true,
      brains: offer.brains,
      defaultBrain: offer.defaultBrain,
    };
  }

  if (budget.state.exhausted === null) {
    return {
      available: true,
      brains: offer.brains,
      defaultBrain: offer.defaultBrain,
      budget: budgetViewOf(budget.state),
    };
  }

  return {
    available: true,
    brains: offer.brains,
    defaultBrain: offer.defaultBrain,
    gate: {
      level: "hard",
      resetsAtMs: budget.state.resetsAtMs,
      gated: offer.gated,
    },
    budget: budgetViewOf(budget.state),
  };
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
 * usage display. Reservations are the budget's alone. */
function createTurnMeter(
  ctx: Ctx,
  caller: Caller,
  tier: JarvisTier,
): TurnMeter {
  const budgetMeter = ctx.jarvisBudget.meterFor(caller, tier);

  return {
    beginRequest: (
      brain: Exclude<JarvisBrain, "scripted">,
      ceiling: JarvisTokenUsage,
    ): void => {
      budgetMeter.beginRequest(brain, ceiling);
    },
    record: (
      brain: Exclude<JarvisBrain, "scripted">,
      usage: JarvisTokenUsage,
    ): void => {
      budgetMeter.record(brain, usage);
      ctx.usageMeter.recordTokens(brain, usage);
    },
    endRequest: (): void => {
      budgetMeter.endRequest();
    },
    exhausted: (): boolean => {
      return budgetMeter.exhausted();
    },
  };
}

/**
 * Produces the JARVIS_* wire effects, closing over the given `loops`.
 *
 * `availability$` always registers — even with `loops === null` — so the
 * client's `JARVIS_SUBSCRIBE` handshake always gets an answer instead of
 * hanging when Jarvis is absent (RTC_JARVIS_FAKE off, no Anthropic key).
 * The payload is per connection (spec §3.8): `brains`/`defaultBrain` are what
 * `JarvisLoops` can serve narrowed to the caller's tier, and to the scripted
 * brain alone once the caller's budget is spent, with the budget itself
 * alongside — see `buildAvailabilityPayload`. When Jarvis is absent entirely
 * the payload is `available: false` with `brains: []` — the `available` flag
 * is what a client must key off (the orb hides, so no picker renders); an
 * empty `brains` array is NOT a nullish sentinel and must never be read as
 * "all brains offered". Each live observer re-reads the caller's budget on
 * every `ctx.jarvisBudget.changes$` (a spend by anyone, a store outage or
 * recovery, the day changing at 00:00 UTC), so a spend in another tab or the
 * midnight lift re-pushes a fresh frame without the client re-sending
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
 * A turn reads the budget before it is routed (spec §3.3): the read waits
 * inside the `concatMap` queue, so turns stay serialized, and a cancel that
 * lands while it is pending keeps that turn from starting at all.
 *
 * The session effect is a factory rather than a constant `WsEffect[]` (like
 * `fxEffects`): each `AgentLoop.createSession()` call runs inside the effect
 * body itself, which `createWsListener` invokes once per socket — so every
 * connection gets its own `AgentSession`(s) with their own pending-
 * confirmation state, the P3 fix for the P2 cross-socket confirmation-forgery
 * risk. `loops.scripted` and `loops.anthropic` are each lazily sessioned on
 * FIRST use by that connection: a connection that only ever picks scripted
 * brains never calls `loops.anthropic.createSession()` (no wasted Anthropic
 * client-side session state), and vice versa.
 */
export function jarvisEffects(loops: JarvisLoops | null): WsEffect<Ctx>[] {
  /** One subscriber's frames: the first at once, then one per change to
   * what this caller is offered. */
  function projectAvailability(ctx: Ctx): Observable<Outbound> {
    const caller = ctx.caller;

    if (loops === null || caller === null) {
      return of(
        out(
          SERVER_MSG.JARVIS_AVAILABILITY,
          buildAvailabilityPayload(loops, null),
        ),
      );
    }

    return merge(of(undefined), ctx.jarvisBudget.changes$).pipe(
      switchMap((): Observable<ConnectionBudget> => {
        return from(readConnectionBudget(ctx, caller));
      }),
      map((budget): JarvisAvailabilityPayload => {
        return buildAvailabilityPayload(loops, budget);
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

  function availability$(
    in$: Observable<Inbound>,
    ctx: Ctx,
  ): Observable<Outbound> {
    return in$.pipe(
      matchType(CLIENT_MSG.JARVIS_SUBSCRIBE),
      switchMap((): Observable<Outbound> => {
        return projectAvailability(ctx);
      }),
    );
  }

  if (loops === null) {
    return [availability$];
  }

  const activeLoops: JarvisLoops = loops;

  function jarvisSessionEffect(
    in$: Observable<Inbound>,
    ctx: Ctx,
  ): Observable<Outbound> {
    // Lazily created on first use — see the laziness note on `jarvisEffects`
    // above. `null` means "not yet created for this connection", not "no
    // loop available" (that's `activeLoops.anthropic === null`, checked
    // separately in `runTurnFor`).
    let scriptedSession: AgentSession | null = null;
    let anthropicSession: AgentSession | null = null;

    function getScriptedSession(): AgentSession {
      scriptedSession ??= activeLoops.scripted.createSession();
      return scriptedSession;
    }

    /** `null` only when `activeLoops.anthropic` itself is `null` — no live
     * Claude model wired for this process at all. */
    function getAnthropicSession(): AgentSession | null {
      if (!activeLoops.anthropic) {
        return null;
      }

      anthropicSession ??= activeLoops.anthropic.createSession();
      return anthropicSession;
    }

    /** `payload.brain` if it's both a recognized brain AND one of the
     * brains the connection's current offer actually includes, else
     * `offer.defaultBrain` — the same "invalid/un-offered input silently
     * falls back to the default" posture as the parse seam above, not a
     * rejected frame. Pure over `offer` (not `ctx`/`activeLoops`) so the
     * budget is read exactly once per turn at the call site, keeping this
     * function trivially testable and free of hidden reads. */
    function resolveBrain(
      offer: ConnectionOffer,
      payload: JarvisChatPayload,
    ): JarvisBrain {
      if (payload.brain && offer.brains.includes(payload.brain)) {
        return payload.brain;
      }

      return offer.defaultBrain;
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
      brain: JarvisBrain,
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
        // itself a subset of `activeLoops.brains` — and that set only ever
        // lists real models when `activeLoops.anthropic` is non-null (see
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

    /** Routes a parsed turn and runs it. A connection with no caller, and a
     * narrator turn (spec D19: the app's own commentary never spends
     * the house key), run scripted at once with nothing to read or record.
     * Every other turn reads the caller's budget first and is routed against
     * the offer that reading gives; a house brain gets a meter that books
     * each request and stops the turn once the budget is spent. */
    function routeTurn(parsed: JarvisChatPayload): Observable<JarvisEvent> {
      const caller = ctx.caller;

      if (caller === null || parsed.origin === "narrator") {
        return runTurnFor("scripted", parsed, undefined);
      }

      return from(readConnectionBudget(ctx, caller)).pipe(
        concatMap((budget): Observable<JarvisEvent> => {
          if (cancelledTurnId === parsed.turnId) {
            return EMPTY;
          }

          const brain = resolveBrain(offerFor(activeLoops, budget), parsed);

          return runTurnFor(
            brain,
            parsed,
            brain === "scripted"
              ? undefined
              : createTurnMeter(ctx, caller, budget.tier),
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
    // turn still waiting on its budget read checks this before it starts.
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
          // "the" session — there are up to two live brains per connection.
          // Each session's own `ownedConfirmationIds` guard (P3) means only
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
          }

          return EMPTY;
        });
      },
    );

    return merge(
      jarvisChat$(in$),
      jarvisConfirm$(in$, ctx),
      jarvisCancel$(in$, ctx),
    ).pipe(
      finalize((): void => {
        // Only the sessions this connection actually created — never
        // conjures the other brain's session just to dispose it.
        scriptedSession?.dispose();
        anthropicSession?.dispose();
      }),
    );
  }

  return [availability$, jarvisSessionEffect];
}
