import { EMPTY, map, type Observable } from "rxjs";

import type {
  JarvisChatPayload,
  JarvisConfirmPayload,
  JarvisEvent,
} from "@rtc/shared";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import { type Outbound, out, stream, type WsEffect } from "@rtc/ws-effects";

import type { AgentLoop } from "../agent/agentLoop.js";
import type { Ctx } from "./context.js";

/** SERVER_MSG for each `JarvisEvent` variant — the wire rule documented on
 * `JarvisEvent` (see `#/jarvis/jarvisEvent`): the payload IS the variant
 * minus its `type` discriminant, so only the message type itself needs a
 * lookup. */
const WIRE_TYPE_BY_EVENT: Record<JarvisEvent["type"], string> = {
  delta: SERVER_MSG.JARVIS_DELTA,
  toolEvent: SERVER_MSG.JARVIS_TOOL_EVENT,
  confirmRequest: SERVER_MSG.JARVIS_CONFIRM_REQUEST,
  done: SERVER_MSG.JARVIS_DONE,
  error: SERVER_MSG.JARVIS_ERROR,
};

/**
 * Produces the JARVIS_* wire effects, closing over the given `loop` — a
 * factory rather than a constant `WsEffect[]` (like `fxEffects`) because
 * Jarvis is present only when `createAgentLoop` returns non-null
 * (RTC_JARVIS_FAKE-gated), so the loop instance isn't known until
 * composition time in `server/src/index.ts`.
 */
export function jarvisEffects(loop: AgentLoop): WsEffect<Ctx>[] {
  const jarvisChat$: WsEffect<Ctx> = stream(
    CLIENT_MSG.JARVIS_CHAT,
    (payload): Observable<Outbound> => {
      const { text } = payload as JarvisChatPayload;
      return loop.runTurn(text).pipe(
        map((event): Outbound => {
          const { type, ...body } = event;
          return out(WIRE_TYPE_BY_EVENT[type], body);
        }),
      );
    },
  );

  const jarvisConfirm$: WsEffect<Ctx> = stream(
    CLIENT_MSG.JARVIS_CONFIRM,
    (payload): Observable<Outbound> => {
      const { confirmationId, approved } = payload as JarvisConfirmPayload;
      loop.resolveConfirmation(confirmationId, approved);
      return EMPTY;
    },
  );

  return [jarvisChat$, jarvisConfirm$];
}
