import { catchError, Observable, of, TimeoutError, timeout } from "rxjs";

import type {
  JarvisChatPayload,
  JarvisConfirmPayload,
  JarvisEvent,
} from "@rtc/shared";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";

import type { IWsAdapter } from "./IWsAdapter";
import type { JarvisPort } from "./jarvisPort";

/** No `SERVER_MSG.JARVIS_*` frame at all within this window after `ask()`
 * sends `jarvis.chat` collapses the turn into a synthetic offline error
 * instead of hanging forever. Once any frame lands, no further deadline
 * applies — see `createJarvisTurnStream`'s `timeout({ first })`. */
export const JARVIS_FIRST_EVENT_TIMEOUT_MS = 10_000;

const JARVIS_OFFLINE_EVENT: JarvisEvent = {
  type: "error",
  message: "Jarvis is offline, sir — the desk link is down.",
};

// Named tags (rather than inline `{ type: "…" }` literals) so `Extract<
// JarvisEvent, …>` never takes an inline object type argument — the repo's
// `no-restricted-syntax` bans that even inside a type alias.
interface DeltaTag {
  readonly type: "delta";
}
interface ToolEventTag {
  readonly type: "toolEvent";
}
interface ConfirmRequestTag {
  readonly type: "confirmRequest";
}
interface ErrorTag {
  readonly type: "error";
}

type DeltaFramePayload = Omit<Extract<JarvisEvent, DeltaTag>, "type">;
type ToolEventFramePayload = Omit<Extract<JarvisEvent, ToolEventTag>, "type">;
type ConfirmRequestFramePayload = Omit<
  Extract<JarvisEvent, ConfirmRequestTag>,
  "type"
>;
type ErrorFramePayload = Omit<Extract<JarvisEvent, ErrorTag>, "type">;

/** The minimal `Subscriber<JarvisEvent>` surface the turn listeners need. */
interface JarvisTurnSubscriber {
  next(event: JarvisEvent): void;
  complete(): void;
}

/** Attach the five `SERVER_MSG.JARVIS_*` listeners that feed one turn's
 * `JarvisEvent`s to `subscriber`, re-attaching the `type` discriminant the
 * wire strips off. `done`/`error` frames also complete the subscriber.
 * Returns the five `ws.on()` unregister functions for teardown. */
function attachJarvisTurnListeners(
  ws: IWsAdapter,
  subscriber: JarvisTurnSubscriber,
): Array<() => void> {
  return [
    ws.on(SERVER_MSG.JARVIS_DELTA, (payload) => {
      const { text } = payload as DeltaFramePayload;
      subscriber.next({ type: "delta", text });
    }),
    ws.on(SERVER_MSG.JARVIS_TOOL_EVENT, (payload) => {
      const { tool, status } = payload as ToolEventFramePayload;
      subscriber.next({ type: "toolEvent", tool, status });
    }),
    ws.on(SERVER_MSG.JARVIS_CONFIRM_REQUEST, (payload) => {
      const p = payload as ConfirmRequestFramePayload;
      subscriber.next({ type: "confirmRequest", ...p });
    }),
    ws.on(SERVER_MSG.JARVIS_DONE, () => {
      subscriber.next({ type: "done" });
      subscriber.complete();
    }),
    ws.on(SERVER_MSG.JARVIS_ERROR, (payload) => {
      const { message } = payload as ErrorFramePayload;
      subscriber.next({ type: "error", message });
      subscriber.complete();
    }),
  ];
}

/** Builds the cold source `Observable` for one `ask(text)` turn: registers
 * all five listeners before sending `jarvis.chat`, so a same-tick reply
 * can't be missed (the `WsAdapter` buffers pre-open sends, so this also
 * works while the socket is still connecting). Teardown unregisters every
 * listener. */
function createJarvisTurnStream(
  ws: IWsAdapter,
  text: string,
): Observable<JarvisEvent> {
  return new Observable<JarvisEvent>((subscriber) => {
    const unregisterFns = attachJarvisTurnListeners(ws, subscriber);
    ws.send(CLIENT_MSG.JARVIS_CHAT, { text } satisfies JarvisChatPayload);

    return (): void => {
      for (const unregister of unregisterFns) {
        unregister();
      }
    };
  });
}

/** Wire-mode `JarvisPort`: turns `ask`/`confirm` into the `jarvis.*`
 * CLIENT_MSG/SERVER_MSG frames over an `IWsAdapter`. */
export class WsJarvisAdapter implements JarvisPort {
  constructor(private readonly ws: IWsAdapter) {}

  ask(text: string): Observable<JarvisEvent> {
    return createJarvisTurnStream(this.ws, text).pipe(
      // KNOWN P2 LIMITATION (accepted, not a bug to fix here): the wire
      // carries no correlation id, so once this timeout fires and this
      // turn's listeners are torn down, a server that is still streaming
      // the now-orphaned turn (no cancel frame is ever sent) has its
      // stragglers land on whichever turn subscribes NEXT — same class of
      // cross-talk as the snapshot-dispatch bug above, just without a fix
      // available at this layer. The root fix is a wire correlation field,
      // explicitly out of scope for phase 2 (targeted for phase 3). Hard to
      // hit in practice: JarvisMachine serializes turns (concatMap) and the
      // UI disables input while speaking, so a straggler has nowhere to
      // land until the user starts a new turn after an offline timeout.
      timeout({ first: JARVIS_FIRST_EVENT_TIMEOUT_MS }),
      catchError((error: unknown) => {
        if (error instanceof TimeoutError) {
          return of(JARVIS_OFFLINE_EVENT);
        }

        throw error;
      }),
    );
  }

  confirm(confirmationId: string, approved: boolean): void {
    this.ws.send(CLIENT_MSG.JARVIS_CONFIRM, {
      confirmationId,
      approved,
    } satisfies JarvisConfirmPayload);
  }
}
