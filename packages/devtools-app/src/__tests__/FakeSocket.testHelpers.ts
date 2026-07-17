import type { WebSocketLike, WebSocketMessageEvent } from "@rtc/devtools-core";

/** Fake `WebSocketLike` — a plain controllable double for
 * `createRelayInspectorSession` tests. `open()`/`receive()` let a test drive
 * the socket lifecycle without a real relay. Mirrors
 * `packages/devtools-core/src/__tests__/FakeSocket.testHelpers.ts`. */
export class FakeSocket implements WebSocketLike {
  readyState = 0; // CONNECTING

  readonly sent: string[] = [];

  onopen: (() => void) | null = null;

  onmessage: ((event: WebSocketMessageEvent) => void) | null = null;

  onclose: (() => void) | null = null;

  onerror: (() => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3; // CLOSED
  }

  open(): void {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }

  receive(msg: unknown): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}
