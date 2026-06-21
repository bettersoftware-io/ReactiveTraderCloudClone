// packages/client-react/src/app/adapters/WsConnectionEventsAdapter.test.ts

import type { ConnectionEvent } from "@rtc/domain";
import { describe, expect, it } from "vitest";
import { FakeWsAdapter } from "./__tests__/FakeWsAdapter";
import { WsConnectionEventsAdapter } from "./WsConnectionEventsAdapter";

describe("WsConnectionEventsAdapter", () => {
  it("delegates events() to IWsAdapter.connectionEvents()", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsConnectionEventsAdapter(ws);
    const received: ConnectionEvent[] = [];
    adapter.events().subscribe((e) => received.push(e));

    ws.emitConnectionEvent("gatewayConnected");
    ws.emitConnectionEvent("gatewayDisconnected");

    expect(received).toEqual([
      { type: "gatewayConnected" },
      { type: "gatewayDisconnected" },
    ]);
  });

  it("replays the most recent event to a late subscriber", () => {
    const ws = new FakeWsAdapter();
    const adapter = new WsConnectionEventsAdapter(ws);
    ws.emitConnectionEvent("gatewayConnected");

    const late: ConnectionEvent[] = [];
    adapter.events().subscribe((e) => late.push(e));

    expect(late).toEqual([{ type: "gatewayConnected" }]);
  });
});
