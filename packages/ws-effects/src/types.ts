import type { Observable } from "rxjs";

/** A parsed client → server frame. */
export interface Inbound {
  readonly type: string;
  readonly payload?: unknown;
  readonly correlationId?: string;
}

/** A server → client frame to be serialised and sent. */
export interface Outbound {
  readonly type: string;
  readonly payload?: unknown;
  readonly correlationId?: string;
}

/**
 * The one primitive. An effect transforms the inbound message stream into an
 * outbound message stream, given an application context `Ctx`.
 */
export type WsEffect<Ctx> = (
  in$: Observable<Inbound>,
  ctx: Ctx,
) => Observable<Outbound>;

/** Transport-agnostic socket the listener drives. Adapted from `ws` in the app. */
export interface Socket {
  readonly messages$: Observable<Inbound>;
  send(message: Outbound): void;
  readonly closed$: Observable<void>;
}
