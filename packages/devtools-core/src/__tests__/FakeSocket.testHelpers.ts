import type { WebSocketLike, WebSocketMessageEvent } from "../WsRelayDuplex";

/** Fake `WebSocketLike` — a plain controllable double for `WsRelayDuplex`
 * tests. `open()`/`receive()`/`drop()` let a test drive the socket lifecycle
 * without a real network. */
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

  drop(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}
