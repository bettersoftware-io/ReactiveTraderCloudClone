import { describe, expect, it } from "vitest";

import { CLIENT_MSG, SERVER_MSG } from "#/protocol/messages.js";

describe("protocol messages", () => {
  it("keeps the FX/Credit/Admin wire names stable", () => {
    expect(CLIENT_MSG.SUBSCRIBE_PRICING).toBe("subscribe.pricing");
    expect(CLIENT_MSG.EXECUTE_TRADE).toBe("rpc.executeTrade");
    expect(SERVER_MSG.PRICE_TICK).toBe("stream.priceTick");
  });

  it("includes the equities wire names", () => {
    expect(CLIENT_MSG.SUBSCRIBE_WATCHLIST).toBe("subscribe.watchlist");
    expect(CLIENT_MSG.PLACE_ORDER).toBe("rpc.placeOrder");
    expect(SERVER_MSG.ORDER_LIFECYCLE).toBe("stream.orderLifecycle");
    expect(SERVER_MSG.POSITIONS).toBe("stream.positions");
  });

  it("includes the candle-history backfill wire names", () => {
    expect(CLIENT_MSG.GET_CANDLE_HISTORY).toBe("rpc.getCandleHistory");
    expect(SERVER_MSG.CANDLE_HISTORY_RESPONSE).toBe(
      "rpc.getCandleHistory.response",
    );
  });

  it("includes the Jarvis wire names", () => {
    expect(CLIENT_MSG.JARVIS_CHAT).toBe("jarvis.chat");
    expect(CLIENT_MSG.JARVIS_CONFIRM).toBe("jarvis.confirm");
    expect(SERVER_MSG.JARVIS_DELTA).toBe("jarvis.delta");
    expect(SERVER_MSG.JARVIS_TOOL_EVENT).toBe("jarvis.toolEvent");
    expect(SERVER_MSG.JARVIS_CONFIRM_REQUEST).toBe("jarvis.confirmRequest");
    expect(SERVER_MSG.JARVIS_DONE).toBe("jarvis.done");
    expect(SERVER_MSG.JARVIS_ERROR).toBe("jarvis.error");
  });

  it("includes the Jarvis P3 wire names (turn correlation, cancel, availability)", () => {
    expect(CLIENT_MSG.JARVIS_CANCEL).toBe("jarvis.cancel");
    expect(CLIENT_MSG.JARVIS_SUBSCRIBE).toBe("jarvis.subscribe");
    expect(SERVER_MSG.JARVIS_AVAILABILITY).toBe("jarvis.availability");
  });
});
