/**
 * WebSocket message envelope shape.
 *
 * The message-type constants (`CLIENT_MSG`/`SERVER_MSG`) live in
 * `@rtc/shared`; effects import them from there directly. This interface
 * stays here because it is still used by `FakeWs.testHelpers.ts`.
 */
export interface WsMessage {
  readonly type: string;
  readonly payload?: unknown;
  readonly correlationId?: string;
}
