import { describe, expect, it, vi } from "vitest";

import type { WebSocketLike } from "../WsRelayDuplex";
import { WsRelayDuplex } from "../WsRelayDuplex";
import { FakeSocket } from "./FakeSocket.testHelpers";

describe("WsRelayDuplex", () => {
  it("tags the role, buffers pre-open sends, and flushes them JSON-encoded on open", () => {
    const sockets: FakeSocket[] = [];
    const duplex = new WsRelayDuplex<KindMessage, unknown>(
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
    const duplex = new WsRelayDuplex<unknown, KindMessage>(
      "ws://host",
      "panel",
      trackingFactory(sockets),
    );
    const got: KindMessage[] = [];
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
    const duplex = new WsRelayDuplex<CountMessage, unknown>(
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

  it("uses the platform WebSocket constructor via the default factory when none is injected", () => {
    const created: FakeSocket[] = [];

    class TrackedFakeSocket extends FakeSocket {
      constructor(url: string) {
        super(url);
        created.push(this);
      }
    }

    vi.stubGlobal("WebSocket", TrackedFakeSocket);

    const duplex = new WsRelayDuplex<KindMessage, unknown>("ws://host", "app");
    const socket = created[0];

    if (socket === undefined) {
      throw new Error("expected a socket");
    }

    expect(socket.url).toBe("ws://host?role=app");

    duplex.send({ kind: "hello" });
    socket.open(); // the default-factory socket flushes the queue like any other
    expect(socket.sent).toEqual(['{"kind":"hello"}']);

    duplex.dispose();
    vi.unstubAllGlobals();
  });

  it("silently drops an inbound frame that fails to parse as JSON", () => {
    const sockets: FakeSocket[] = [];
    const duplex = new WsRelayDuplex<unknown, KindMessage>(
      "ws://host",
      "panel",
      trackingFactory(sockets),
    );
    const got: KindMessage[] = [];
    duplex.inbound$.subscribe((m) => {
      got.push(m);
    });

    const socket = sockets[0];

    if (socket === undefined) {
      throw new Error("expected a socket");
    }

    socket.open();
    socket.onmessage?.({ data: "not-json{" });

    expect(got).toEqual([]);

    duplex.dispose();
  });

  it("cancels a pending reconnect timer and reschedules when the socket drops again before it fires", () => {
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
    socket.drop(); // schedules reconnect #1, due at t=1000

    vi.advanceTimersByTime(500); // t=500 — nothing fired yet
    expect(sockets).toHaveLength(1);

    socket.drop(); // cancels #1, schedules reconnect #2 due at t=1500

    vi.advanceTimersByTime(500); // t=1000 — #1 would have fired here uncancelled
    expect(sockets).toHaveLength(1);

    vi.advanceTimersByTime(500); // t=1500 — #2 fires
    expect(sockets).toHaveLength(2);

    duplex.dispose();
    vi.useRealTimers();
  });

  it("does not flush the send queue when onopen fires before readyState reflects OPEN", () => {
    const sockets: FakeSocket[] = [];
    const duplex = new WsRelayDuplex<CountMessage, unknown>(
      "ws://host",
      "app",
      trackingFactory(sockets),
    );
    const socket = sockets[0];

    if (socket === undefined) {
      throw new Error("expected a socket");
    }

    duplex.send({ n: 1 });
    socket.onopen?.(); // fires without readyState having transitioned to OPEN

    expect(socket.sent).toEqual([]); // must stay buffered, not sent early

    socket.open(); // a genuine open — readyState flips, then onopen fires
    expect(socket.sent).toEqual(['{"n":1}']);

    duplex.dispose();
  });

  it("sends immediately over an already-open socket instead of queueing", () => {
    const sockets: FakeSocket[] = [];
    const duplex = new WsRelayDuplex<CountMessage, unknown>(
      "ws://host",
      "app",
      trackingFactory(sockets),
    );
    const socket = sockets[0];

    if (socket === undefined) {
      throw new Error("expected a socket");
    }

    socket.open();
    duplex.send({ n: 7 });

    expect(socket.sent).toEqual(['{"n":7}']);

    duplex.dispose();
  });

  it("cancels a pending reconnect timer on dispose so a stale timer never reconnects", () => {
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
    socket.drop(); // schedules a reconnect
    duplex.dispose();

    vi.advanceTimersByTime(5000);
    expect(sockets).toHaveLength(1); // the pending timer must not have fired

    vi.useRealTimers();
  });
});

function trackingFactory(sink: FakeSocket[]): (url: string) => WebSocketLike {
  return (url: string): WebSocketLike => {
    const socket = new FakeSocket(url);
    sink.push(socket);

    return socket;
  };
}

interface KindMessage {
  kind: string;
}

interface CountMessage {
  n: number;
}
