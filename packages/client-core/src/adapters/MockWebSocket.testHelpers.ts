import { type Mock, vi } from "vitest";

export let lastMock: MockWebSocket;

export class MockWebSocket {
  static OPEN = 1;

  static constructed = 0;

  readyState = 0;

  onopen: ((ev: Event) => void) | null = null;

  onclose: ((ev: CloseEvent) => void) | null = null;

  onmessage: ((ev: MessageEvent) => void) | null = null;

  onerror: ((ev: Event) => void) | null = null;

  send: Mock = vi.fn();

  close: Mock = vi.fn();

  constructor() {
    MockWebSocket.constructed++;
    // Capture the most recently constructed socket so tests can drive its
    // event handlers. WsAdapter does `new WebSocket(url)`, so a constructable
    // stub is required — vitest forwards `new` to the stubbed global, and an
    // arrow `mockImplementation` is not a constructor.
    lastMock = this;
  }
}
