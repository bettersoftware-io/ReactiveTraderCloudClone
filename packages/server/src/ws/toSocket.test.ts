import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { FakeWs } from "./FakeWs.testHelpers.js";
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
});
