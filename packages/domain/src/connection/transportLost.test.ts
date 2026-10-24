import { describe, expect, it } from "vitest";

import {
  createTransportLostError,
  isTransportLost,
  TRANSPORT_LOST_ERROR_NAME,
} from "./transportLost.js";

describe("isTransportLost", () => {
  it("recognises an error built by createTransportLostError, keeping its message", () => {
    const error = createTransportLostError("WsAdapter connection lost");

    expect(isTransportLost(error)).toBe(true);
    expect(error.name).toBe(TRANSPORT_LOST_ERROR_NAME);
    expect(error.message).toBe("WsAdapter connection lost");
  });

  it("recognises any Error carrying the name, whatever its message", () => {
    const error = new Error("anything");
    error.name = TRANSPORT_LOST_ERROR_NAME;

    expect(isTransportLost(error)).toBe(true);
  });

  it("rejects a plain Error, a lookalike message, and non-errors", () => {
    expect(isTransportLost(new Error("WsAdapter connection lost"))).toBe(false);
    expect(isTransportLost("TransportLostError")).toBe(false);
    expect(isTransportLost({ name: TRANSPORT_LOST_ERROR_NAME })).toBe(false);
    expect(isTransportLost(null)).toBe(false);
  });
});
