import { firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { FakeWs } from "./FakeWs.testHelpers.js";
import { createTokenBucket } from "./tokenBucket.js";
import { toSocket } from "./toSocket.js";

describe("toSocket", () => {
  it("emits parsed inbound frames", async () => {
    const ws = new FakeWs();
    const socket = toSocket(ws as unknown as import("ws").WebSocket);
    const first = firstValueFrom(socket.messages$);
    ws.receive({ type: "subscribe.pricing", payload: { symbol: "EURUSD" } });
    expect(await first).toEqual({
      type: "subscribe.pricing",
      payload: { symbol: "EURUSD" },
    });
  });

  it("forwards send() as JSON when open", () => {
    const ws = new FakeWs();
    const socket = toSocket(ws as unknown as import("ws").WebSocket);
    socket.send({ type: "stream.priceTick", payload: { bid: 1 } });
    expect(ws.framesOfType("stream.priceTick")).toHaveLength(1);
  });

  it("completes closed$ on socket close", async () => {
    const ws = new FakeWs();
    const socket = toSocket(ws as unknown as import("ws").WebSocket);
    const closed = firstValueFrom(socket.closed$);
    ws.closeConnection();
    await expect(closed).resolves.toBeUndefined();
  });

  it("drops a malformed (non-JSON) frame without emitting or erroring, and still delivers the next valid frame", async () => {
    const ws = new FakeWs();
    const socket = toSocket(ws as unknown as import("ws").WebSocket);
    const received: unknown[] = [];
    let errored = false;
    socket.messages$.subscribe({
      next: (msg: unknown) => {
        received.push(msg);
      },
      error: () => {
        errored = true;
      },
    });

    ws.emit("message", "not json");
    ws.receive({ type: "subscribe.pricing", payload: { symbol: "EURUSD" } });

    expect(errored).toBe(false);
    expect(received).toEqual([
      { type: "subscribe.pricing", payload: { symbol: "EURUSD" } },
    ]);
  });

  it("drops a frame that parses to a non-object (null, number, array) without emitting or erroring, and still delivers the next valid frame", () => {
    const ws = new FakeWs();
    const socket = toSocket(ws as unknown as import("ws").WebSocket);
    const received: unknown[] = [];
    let errored = false;
    socket.messages$.subscribe({
      next: (msg: unknown) => {
        received.push(msg);
      },
      error: () => {
        errored = true;
      },
    });

    ws.emit("message", "null");
    ws.emit("message", "42");
    ws.emit("message", "[]");
    ws.receive({ type: "subscribe.pricing", payload: { symbol: "EURUSD" } });

    expect(errored).toBe(false);
    expect(received).toEqual([
      { type: "subscribe.pricing", payload: { symbol: "EURUSD" } },
    ]);
  });

  it("counts CONSECUTIVE drops: a successful take resets the run, so an occasional burst never reaches the close", () => {
    const ws = new FakeWs();
    const onFlood = vi.fn();
    let clock = 0;
    const socket = toSocket(ws as unknown as import("ws").WebSocket, {
      bucket: createTokenBucket(1, 1_000),
      dropsBeforeClose: 3,
      now: (): number => {
        return clock;
      },
      onFlood,
    });
    socket.messages$.subscribe();

    // Three rounds of: one delivered frame, then two dropped (bucket of 1,
    // refilled over 1 s). Six drops in total, never three in a row.
    for (let round = 0; round < 3; round += 1) {
      ws.receive({ type: "ping", payload: round });
      ws.receive({ type: "ping", payload: round });
      ws.receive({ type: "ping", payload: round });
      clock += 1_000;
    }

    expect(ws.closedWith).toBeUndefined();
    expect(onFlood).not.toHaveBeenCalled();
  });

  it("drops frames once the bucket is empty, closes with 1008 after dropsBeforeClose drops, and reports the flood once (S8)", () => {
    const ws = new FakeWs();
    const onFlood = vi.fn();
    const socket = toSocket(ws as unknown as import("ws").WebSocket, {
      bucket: createTokenBucket(2, 0),
      dropsBeforeClose: 3,
      now: (): number => {
        return 0;
      },
      onFlood,
    });
    const received: unknown[] = [];
    socket.messages$.subscribe((msg: unknown) => {
      received.push(msg);
    });

    for (let i = 0; i < 5; i += 1) {
      ws.receive({ type: "ping", payload: i });
    }

    expect(received).toHaveLength(2);
    expect(ws.closedWith).toEqual({
      code: 1008,
      reason: "message rate exceeded",
    });
    expect(onFlood).toHaveBeenCalledTimes(1);
  });

  it("keeps frames flowing when the bucket refills between them", () => {
    const ws = new FakeWs();
    let clock = 0;
    const socket = toSocket(ws as unknown as import("ws").WebSocket, {
      bucket: createTokenBucket(1, 1_000),
      dropsBeforeClose: 1,
      now: (): number => {
        return clock;
      },
      onFlood: vi.fn(),
    });
    const received: unknown[] = [];
    socket.messages$.subscribe((msg: unknown) => {
      received.push(msg);
    });

    for (let i = 0; i < 3; i += 1) {
      ws.receive({ type: "ping", payload: i });
      clock += 10;
    }

    expect(received).toHaveLength(3);
    expect(ws.closedWith).toBeUndefined();
  });
});
