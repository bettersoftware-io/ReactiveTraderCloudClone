import { describe, expect, it } from "vitest";

import { DEVICE_PIN, goldenPath } from "#/../tests/visual/shared/goldens";

describe("goldenPath", () => {
  it("uses the device pin and tier", () => {
    expect(DEVICE_PIN).toBe("ios-iphone17-26");
    const p = goldenPath("simctl", "fx/tile-up-holo3d");
    expect(
      p.endsWith(
        "tests/visual/__screenshots__/ios-iphone17-26/simctl/fx/tile-up-holo3d.png",
      ),
    ).toBe(true);
    expect(p.startsWith("/")).toBe(true);
  });
});
