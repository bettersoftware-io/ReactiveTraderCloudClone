import type { WebSocketLike, WebSocketMessageEvent } from "@rtc/devtools-core";

/** Silent `WebSocketLike` double — never opens, never emits. Used where a test
 * only needs to observe how a socket is constructed (the URL it was given),
 * not drive its lifecycle. Mirrors devtools-core's own `FakeSocket` helper. */
export class SilentSocket implements WebSocketLike {
  readyState = 0;

  onopen: (() => void) | null = null;

  onmessage: ((event: WebSocketMessageEvent) => void) | null = null;

  onclose: (() => void) | null = null;

  onerror: (() => void) | null = null;

  constructor(readonly url: string) {}

  send(): void {}

  close(): void {
    this.readyState = 3;
  }
}
