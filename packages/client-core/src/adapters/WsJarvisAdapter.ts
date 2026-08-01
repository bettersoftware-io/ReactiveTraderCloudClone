import {
  catchError,
  distinctUntilChanged,
  filter,
  Observable,
  of,
  switchMap,
  TimeoutError,
  timeout,
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

import type { IWsAdapter } from "./IWsAdapter";
import type { JarvisPort } from "./jarvisPort";

/** No `SERVER_MSG.JARVIS_*` frame at all within this window after `ask()`
 * sends `jarvis.chat` collapses the turn into a synthetic offline error
 * instead of hanging forever. Once any frame lands, no further deadline
 * applies — see `createJarvisTurnStream`'s `timeout({ first })`. Reused by
 * `availability$()` for the same "the server never answered" case. */
export const JARVIS_FIRST_EVENT_TIMEOUT_MS = 10_000;

/** Caps what `ask()` sends as `JarvisChatPayload.history` — belt-and-suspenders
 * with the server's own truncation (`JARVIS_WIRE_HISTORY_MAX_ENTRIES` in
 * `jarvis.effects.ts`, also 20): keeping the outbound frame itself small
 * doesn't rely on the server being the only thing enforcing the wire cap. */
const JARVIS_HISTORY_SEND_MAX_ENTRIES = 20;

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

/** Every turn-scoped `SERVER_MSG.JARVIS_*` payload carries `turnId` alongside
 * the `JarvisEvent` variant's own remaining fields (see the wire rule
 * documented on `JarvisEvent` in `#/jarvis/jarvisEvent`) — the listeners
 * below filter on it before stripping it back off. */
type DeltaFramePayload = Omit<Extract<JarvisEvent, DeltaTag>, "type"> & {
  readonly turnId: string;
};
type ToolEventFramePayload = Omit<
  Extract<JarvisEvent, ToolEventTag>,
  "type"
> & { readonly turnId: string };
type ConfirmRequestFramePayload = Omit<
  Extract<JarvisEvent, ConfirmRequestTag>,
  "type"
> & { readonly turnId: string };
type ErrorFramePayload = Omit<Extract<JarvisEvent, ErrorTag>, "type"> & {
  readonly turnId: string;
};
interface DoneFramePayload {
  readonly turnId: string;
}

/** The minimal `Subscriber<JarvisEvent>` surface the turn listeners need. */
interface JarvisTurnSubscriber {
  next(event: JarvisEvent): void;
  complete(): void;
}

/** Attach the five `SERVER_MSG.JARVIS_*` listeners that feed one turn's
 * `JarvisEvent`s to `subscriber`, re-attaching the `type` discriminant the
 * wire strips off. Every frame is filtered to `payload.turnId === turnId`
 * first — a frame belonging to a different turn (a P2-era straggler arriving
 * after this turn's own listeners replaced a torn-down turn's) is ignored
 * silently rather than misdelivered. `done`/`error` frames also complete the
 * subscriber. Returns the five `ws.on()` unregister functions for teardown. */
function attachJarvisTurnListeners(
  ws: IWsAdapter,
  turnId: string,
  subscriber: JarvisTurnSubscriber,
): Array<() => void> {
  return [
    ws.on(SERVER_MSG.JARVIS_DELTA, (payload) => {
      const p = payload as DeltaFramePayload;

      if (p.turnId !== turnId) {
        return;
      }

      subscriber.next({ type: "delta", text: p.text });
    }),
    ws.on(SERVER_MSG.JARVIS_TOOL_EVENT, (payload) => {
      const p = payload as ToolEventFramePayload;

      if (p.turnId !== turnId) {
        return;
      }

      subscriber.next({ type: "toolEvent", tool: p.tool, status: p.status });
    }),
    ws.on(SERVER_MSG.JARVIS_CONFIRM_REQUEST, (payload) => {
      const p = payload as ConfirmRequestFramePayload;

      if (p.turnId !== turnId) {
        return;
      }

      const { turnId: _turnId, ...rest } = p;
      subscriber.next({ type: "confirmRequest", ...rest });
    }),
    ws.on(SERVER_MSG.JARVIS_DONE, (payload) => {
      const p = payload as DoneFramePayload;

      if (p.turnId !== turnId) {
        return;
      }

      subscriber.next({ type: "done" });
      subscriber.complete();
    }),
    ws.on(SERVER_MSG.JARVIS_ERROR, (payload) => {
      const p = payload as ErrorFramePayload;

      if (p.turnId !== turnId) {
        return;
      }

      subscriber.next({ type: "error", message: p.message });
      subscriber.complete();
    }),
  ];
}

/** Builds the `JarvisChatPayload`, capping `history` at
 * `JARVIS_HISTORY_SEND_MAX_ENTRIES` and omitting the field entirely when
 * there's nothing to replay (keeps the common no-history frame shape the
 * same as before turnId/history existed). */
function buildChatPayload(
  text: string,
  turnId: string,
  history: readonly JarvisHistoryEntry[],
): JarvisChatPayload {
  const capped = history.slice(-JARVIS_HISTORY_SEND_MAX_ENTRIES);
  return capped.length > 0
    ? { text, turnId, history: capped }
    : { text, turnId };
}

/** Builds the cold source `Observable` for one `ask(text)` turn: registers
 * all five turnId-filtered listeners before sending `jarvis.chat`, so a
 * same-tick reply can't be missed (the `WsAdapter` buffers pre-open sends, so
 * this also works while the socket is still connecting). Teardown
 * unregisters every listener AND fires `JARVIS_CANCEL {turnId}` — covering
 * every way this stream stops: the caller unsubscribing early, normal
 * completion (done/error already delivered — the server ignores a cancel for
 * a turnId that isn't in flight, so this is a harmless no-op), and the
 * offline-timeout path in `ask()` below (whose `timeout()` operator
 * unsubscribes this source when it fires, running this same teardown). The
 * adapter always completes the turn locally FIRST in every case — the cancel
 * is best-effort server-side cleanup the client never waits on, and a
 * cancelled turn gets no terminal frame back. */
function createJarvisTurnStream(
  ws: IWsAdapter,
  text: string,
  turnId: string,
  history: readonly JarvisHistoryEntry[],
): Observable<JarvisEvent> {
  return new Observable<JarvisEvent>((subscriber) => {
    const unregisterFns = attachJarvisTurnListeners(ws, turnId, subscriber);
    ws.send(CLIENT_MSG.JARVIS_CHAT, buildChatPayload(text, turnId, history));

    return (): void => {
      for (const unregister of unregisterFns) {
        unregister();
      }

      ws.send(CLIENT_MSG.JARVIS_CANCEL, {
        turnId,
      } satisfies JarvisCancelPayload);
    };
  });
}

/** One connection's live `SERVER_MSG.JARVIS_AVAILABILITY` feed: registers the
 * handler, sends `jarvis.subscribe`, and forwards every push for as long as
 * this source stays subscribed. A soft first-event deadline pushes a
 * synthetic `false` if the server hasn't answered within
 * `JARVIS_FIRST_EVENT_TIMEOUT_MS` — but, unlike `ask()`'s use of the RxJS
 * `timeout()` operator (which errors, and therefore completes, the source —
 * fine for a one-shot turn), this is a plain `setTimeout` that does NOT
 * complete the source: `JARVIS_AVAILABILITY` is a live push channel, so a
 * real answer that lands late (after the synthetic `false`) must still reach
 * the subscriber. Torn down (handler unregistered, timer cleared) when
 * `availability$()`'s outer `switchMap` moves to the NEXT connection, or the
 * caller unsubscribes. */
function createConnectionAvailabilityStream(
  ws: IWsAdapter,
): Observable<boolean> {
  return new Observable<boolean>((subscriber) => {
    let answered = false;
    const timer = setTimeout(() => {
      if (!answered) {
        subscriber.next(false);
      }
    }, JARVIS_FIRST_EVENT_TIMEOUT_MS);

    const unregister = ws.on(SERVER_MSG.JARVIS_AVAILABILITY, (payload) => {
      answered = true;
      clearTimeout(timer);
      const { available } = payload as JarvisAvailabilityPayload;
      subscriber.next(available);
    });
    ws.send(CLIENT_MSG.JARVIS_SUBSCRIBE);

    return (): void => {
      clearTimeout(timer);
      unregister();
    };
  });
}

/** Wire-mode `JarvisPort`: turns `ask`/`confirm` into the `jarvis.*`
 * CLIENT_MSG/SERVER_MSG frames over an `IWsAdapter`. */
export class WsJarvisAdapter implements JarvisPort {
  /** Late-bound by composition once `JarvisMachine` exists: the history this
   * adapter needs to replay is that machine's own state, but the machine is
   * built FROM this port, so the source can't be injected at construction
   * time without a cycle. A mutable setter breaks the cycle (the same
   * late-binding shape `portFactory.createSimulatorPorts` uses for
   * `createInstantReveal$`, which is threaded in as an already-built
   * Observable rather than needing a setter because preferences has no such
   * cycle). Defaults to `() => []` so `ask()` works before composition wires
   * it, and in any test/composition path that never calls `setHistorySource`
   * (e.g. `ui-contract`'s WS-real fixtures). */
  private historySource: () => readonly JarvisHistoryEntry[] = () => {
    return [];
  };

  constructor(private readonly ws: IWsAdapter) {}

  /** Injects the live history snapshot source. See the field doc above for
   * why this is a setter rather than a constructor parameter. */
  setHistorySource(source: () => readonly JarvisHistoryEntry[]): void {
    this.historySource = source;
  }

  ask(text: string): Observable<JarvisEvent> {
    const turnId = crypto.randomUUID();

    return createJarvisTurnStream(
      this.ws,
      text,
      turnId,
      this.historySource(),
    ).pipe(
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

  /** Not turn-scoped and not part of `JarvisPort` (see `jarvisPort.ts` — its
   * surface stays unchanged for this task): a query/push channel for the
   * Jarvis backend's live availability.
   *
   * Re-queries on every `gatewayConnected` event from `ws.connectionEvents()`
   * (a `ReplaySubject(1)` — a subscribe that lands while already connected
   * gets the replayed event immediately, so this fires right away in the
   * common case), NOT just once at subscribe time: a `jarvis.subscribe` sent
   * on a since-dropped socket reaches nobody, so a subscriber that outlives
   * one connection (the normal case — a UI badge, say) needs to re-arm on
   * every reconnect, including the one after a server restart. `switchMap`
   * tears down the previous connection's `JARVIS_AVAILABILITY` listener
   * before arming the new one. `distinctUntilChanged` collapses a
   * reconnect's re-query landing on the same boolean into a no-op for
   * subscribers. See `createConnectionAvailabilityStream` for the per-
   * connection deadline-without-completing behaviour. */
  availability$(): Observable<boolean> {
    return this.ws.connectionEvents().pipe(
      filter((event) => {
        return event.type === "gatewayConnected";
      }),
      switchMap(() => {
        return createConnectionAvailabilityStream(this.ws);
      }),
      distinctUntilChanged(),
    );
  }
}
