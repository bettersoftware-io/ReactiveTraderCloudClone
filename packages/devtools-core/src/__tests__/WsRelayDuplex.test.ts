import { describe, expect, it, vi } from "vitest";

import type { WebSocketLike } from "../WsRelayDuplex";
import { WsRelayDuplex } from "../WsRelayDuplex";

class FakeSocket implements WebSocketLike {
  readyState = 0; // CONNECTING

  readonly sent: string[] = [];

  onopen: (() => void) | null = null;

  onmessage: ((event: { data: unknown }) => void) | null = null;

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

function trackingFactory(sink: FakeSocket[]): (url: string) => WebSocketLike {
  return (url: string): WebSocketLike => {
    const socket = new FakeSocket(url);
    sink.push(socket);

    return socket;
  };
}

describe("WsRelayDuplex", () => {
  it("tags the role, buffers pre-open sends, and flushes them JSON-encoded on open", () => {
    const sockets: FakeSocket[] = [];
    const duplex = new WsRelayDuplex<{ kind: string }, unknown>(
      "ws://localhost:8790",
      "app",
      trackingFactory(sockets),
    );

    const socket = sockets[0];
    if (socket === undefined) {
      throw new Error("expected a socket");
    }
    expect(socket.url).toBe("ws://localhost:8790?role=app");

    duplex.send({ kind: "hello" });
    expect(socket.sent).toEqual([]); // buffered — socket not OPEN yet

    socket.open();
    expect(socket.sent).toEqual(['{"kind":"hello"}']);

    duplex.dispose();
  });

  it("appends role with & when the url already has a query", () => {
    const sockets: FakeSocket[] = [];
    const duplex = new WsRelayDuplex<unknown, unknown>(
      "ws://host/relay?x=1",
      "panel",
      trackingFactory(sockets),
    );

    const socket = sockets[0];
    if (socket === undefined) {
      throw new Error("expected a socket");
    }
    expect(socket.url).toBe("ws://host/relay?x=1&role=panel");

    duplex.dispose();
  });

  it("parses inbound socket frames onto inbound$", () => {
    const sockets: FakeSocket[] = [];
    const duplex = new WsRelayDuplex<unknown, { kind: string }>(
      "ws://host",
      "panel",
      trackingFactory(sockets),
    );
    const got: Array<{ kind: string }> = [];
    duplex.inbound$.subscribe((m) => {
      got.push(m);
    });

    const socket = sockets[0];
    if (socket === undefined) {
      throw new Error("expected a socket");
    }
    socket.open();
    socket.receive({ kind: "welcome" });

    expect(got).toEqual([{ kind: "welcome" }]);

    duplex.dispose();
  });

  it("reconnects with a fresh socket when the current one drops", () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const duplex = new WsRelayDuplex<unknown, unknown>(
      "ws://host",
      "app",
      trackingFactory(sockets),
      1000,
    );

    const socket = sockets[0];
    if (socket === undefined) {
      throw new Error("expected a socket");
    }
    socket.open();
    socket.drop();
    expect(sockets).toHaveLength(1); // reconnect is scheduled, not immediate

    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2); // fresh socket opened

    duplex.dispose();
    vi.useRealTimers();
  });

  it("stops reconnecting and drops sends after dispose", () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const duplex = new WsRelayDuplex<{ n: number }, unknown>(
      "ws://host",
      "app",
      trackingFactory(sockets),
      1000,
    );
    const socket = sockets[0];
    if (socket === undefined) {
      throw new Error("expected a socket");
    }
    socket.open();

    duplex.dispose();
    socket.drop(); // a drop after dispose must not schedule a reconnect
    vi.advanceTimersByTime(5000);
    expect(sockets).toHaveLength(1);

    duplex.send({ n: 1 });
    expect(socket.sent).toEqual([]); // disposed → dropped

    vi.useRealTimers();
  });
});
