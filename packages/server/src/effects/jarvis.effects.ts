import { defer, EMPTY, finalize, map, merge, type Observable, of } from "rxjs";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHistoryEntry(value: unknown): value is JarvisHistoryEntry {
  return (
    isRecord(value) &&
    (value.role === "user" || value.role === "jarvis") &&
    typeof value.text === "string"
  );
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
    history: history as readonly JarvisHistoryEntry[] | undefined,
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

    const jarvisChat$: WsEffect<Ctx> = stream(
      CLIENT_MSG.JARVIS_CHAT,
      (payload): Observable<Outbound> => {
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

          return session.runTurn(parsed.text, parsed.history ?? []).pipe(
            map((event): Outbound => {
              const { type, ...body } = event;
              return out(WIRE_TYPE_BY_EVENT[type], {
                ...body,
                turnId: parsed.turnId,
              });
            }),
          );
        });
      },
    );

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

          session.cancelTurn();
          return EMPTY;
        });
      },
    );

    return merge(
      jarvisChat$(in$, ctx),
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
