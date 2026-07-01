import { describe, expect, it } from "vitest";

import { buildWsUrl } from "./wsUrl";

describe("buildWsUrl", () => {
  it("returns the bare url when no token is set", () => {
    expect(buildWsUrl("wss://h.fly.dev", undefined)).toBe("wss://h.fly.dev");
    expect(buildWsUrl("wss://h.fly.dev", "")).toBe("wss://h.fly.dev");
  });

  it("appends the access token as a query param", () => {
    expect(buildWsUrl("wss://h.fly.dev", "tok")).toBe(
      "wss://h.fly.dev/?access=tok",
    );
  });

  it("preserves an existing query string", () => {
    expect(buildWsUrl("wss://h.fly.dev/?x=1", "tok")).toBe(
      "wss://h.fly.dev/?x=1&access=tok",
    );
  });
});
