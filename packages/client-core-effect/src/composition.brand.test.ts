import { describe, expect, it } from "vitest";

import { EFFECT_CORE_BRAND, effectCore } from "#/index";

describe("effectCore brand", () => {
  it("carries the Effect core brand", () => {
    expect((effectCore as Branded).brand).toBe(EFFECT_CORE_BRAND);
    expect(EFFECT_CORE_BRAND).toBe("@rtc/client-core-effect:brand");
  });
});

interface Branded {
  brand?: string;
}
