import { describe, expect, it } from "vitest";

import { WS_EFFECTS_VERSION } from "#/index";

describe("@rtc/ws-effects", () => {
  it("exposes a version marker", () => {
    expect(WS_EFFECTS_VERSION).toBe("0.0.0");
  });
});
