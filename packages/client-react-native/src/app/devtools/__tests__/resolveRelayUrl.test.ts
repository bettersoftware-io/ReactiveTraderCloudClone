import { describe, expect, it } from "vitest";

import { resolveRelayUrl } from "#/app/devtools/resolveRelayUrl";

describe("resolveRelayUrl", () => {
  it("defaults to localhost when there is no Metro host", () => {
    expect(resolveRelayUrl(undefined)).toBe("ws://localhost:8790");
  });

  it("uses the Metro host so a physical device can reach the dev machine", () => {
    expect(resolveRelayUrl("192.168.1.5:8081")).toBe("ws://192.168.1.5:8790");
  });

  it("handles a bare host without a port", () => {
    expect(resolveRelayUrl("localhost")).toBe("ws://localhost:8790");
  });
});
