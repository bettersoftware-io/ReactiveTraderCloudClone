import type { Observable } from "rxjs";

import type { ConnectionEvent } from "@rtc/domain";

/**
 * Common surface for the real WsAdapter and the test-only FakeWsAdapter.
 * Both must agree on these method signatures so port factories work against either.
 */
export type MessageHandler = (payload: unknown) => void;

export interface IWsAdapter {
  on(type: string, handler: MessageHandler): () => void;
  send(type: string, payload?: unknown): void;
  rpc(type: string, payload?: unknown): Promise<unknown>;
  /**
   * Observable of gateway lifecycle events.
   * Backed by `ReplaySubject(1)` so late subscribers see the most recent state.
   */
  connectionEvents(): Observable<ConnectionEvent>;
  /** Close the current socket for an idle timeout without disposing the adapter.
   * Suppresses auto-reconnect; preserves sendQueue for reopen(). */
  closeForIdle(): void;
  /** Re-establish the socket after an idle close (user-initiated). */
  reopen(): void;
  dispose(): void;
}
