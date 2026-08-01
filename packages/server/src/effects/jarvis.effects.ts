import {
  catchError,
  concatMap,
  defer,
  EMPTY,
  finalize,
  map,
  merge,
  type Observable,
  of,
} from "rxjs";

import type {
  JarvisAvailabilityPayload,
  JarvisCancelPayload,
  JarvisChatPayload,
  JarvisConfirmPayload,
  JarvisEvent,
  JarvisHistoryEntry,
} from "@rtc/shared";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import {
  type Inbound,
  matchType,
  type Outbound,
  out,
  stream,
  type WsEffect,
} from "@rtc/ws-effects";

import type { AgentLoop } from "../agent/agentLoop.js";
import type { Ctx } from "./context.js";

/** SERVER_MSG for each `JarvisEvent` variant — the wire rule documented on
 * `JarvisEvent` (see `#/jarvis/jarvisEvent`): the payload IS the variant
 * minus its `type` discriminant plus a correlating `turnId`, so only the
 * message type itself needs a lookup. */
const WIRE_TYPE_BY_EVENT: Record<JarvisEvent["type"], string> = {
  delta: SERVER_MSG.JARVIS_DELTA,
  toolEvent: SERVER_MSG.JARVIS_TOOL_EVENT,
  confirmRequest: SERVER_MSG.JARVIS_CONFIRM_REQUEST,
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

function parseChatPayload(payload: unknown): JarvisChatPayload | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const { text, turnId, history } = payload;

  if (typeof text !== "string" || typeof turnId !== "string") {
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

/**
 * Produces the JARVIS_* wire effects, closing over the given `loop`.
 *
 * `availability$` always registers — even with `loop === null` — so the
 * client's `JARVIS_SUBSCRIBE` handshake always gets an answer instead of
 * hanging when Jarvis is absent (RTC_JARVIS_FAKE off, no Anthropic key).
 *
 * The session effect is a factory rather than a constant `WsEffect[]` (like
 * `fxEffects`): `loop.createSession()` runs inside the effect body itself,
 * which `createWsListener` invokes once per socket — so every connection
 * gets its own `AgentSession` with its own pending-confirmation state, the
 * P3 fix for the P2 cross-socket confirmation-forgery risk.
 */
export function jarvisEffects(loop: AgentLoop | null): WsEffect<Ctx>[] {
  const availability$: WsEffect<Ctx> = stream(
    CLIENT_MSG.JARVIS_SUBSCRIBE,
    (): Observable<Outbound> => {
      return of(
        out(SERVER_MSG.JARVIS_AVAILABILITY, {
          available: loop !== null,
        } satisfies JarvisAvailabilityPayload),
      );
    },
  );

  if (loop === null) {
    return [availability$];
  }

  const activeLoop: AgentLoop = loop;

  function jarvisSessionEffect(
    in$: Observable<Inbound>,
    ctx: Ctx,
  ): Observable<Outbound> {
    const session = activeLoop.createSession();

    // The turnId of whichever turn `session.runTurn()` currently has open —
    // set at that turn's subscribe time, cleared in its own `finalize`.
    // `session.cancelTurn()` is turnId-blind (it cancels whatever is
    // running), so this is the effect-layer gate that keeps a cancel from
    // one turn from reaching a DIFFERENT, later turn: the client sends
    // `jarvis.cancel` on every teardown including normal completion (see
    // `AgentSession.cancelTurn`'s doc comment), so a stale cancel for an
    // already-finished turn arriving after a new turn has started must be a
    // silent no-op rather than killing the new turn mid-stream.
    let inFlightTurnId: string | undefined;

    function projectChatTurn(payload: unknown): Observable<Outbound> {
      return defer((): Observable<Outbound> => {
        const parsed = parseChatPayload(payload);

        if (!parsed) {
          const turnId = extractTurnId(payload);

          if (!turnId) {
            console.warn("jarvis.chat: dropping malformed payload", payload);
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

        return session.runTurn(parsed.text, parsed.history ?? []).pipe(
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
            console.warn("jarvis.confirm: dropping malformed payload", payload);
            return EMPTY;
          }

          session.resolveConfirmation(parsed.confirmationId, parsed.approved);
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
            console.warn("jarvis.cancel: dropping malformed payload", payload);
            return EMPTY;
          }

          // Stale/mismatched cancel (already-completed or never-started
          // turnId) — silent no-op, per the doc comment above.
          if (parsed.turnId === inFlightTurnId) {
            session.cancelTurn();
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
        session.dispose();
      }),
    );
  }

  return [availability$, jarvisSessionEffect];
}
