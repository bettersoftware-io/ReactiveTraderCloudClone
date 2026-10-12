import { describe, expect, it } from "vitest";

import { DEVICE_PINS, goldenPath } from "#/../tests/visual/shared/goldens";

describe("goldenPath", () => {
  it("uses the iOS device pin and the tier by default", () => {
    expect(DEVICE_PINS.ios).toBe("ios-iphone17-26");
    const p = goldenPath("simctl", "fx/tile-up-holo3d");
    expect(
      p.endsWith(
        "tests/visual/__screenshots__/ios-iphone17-26/simctl/fx/tile-up-holo3d.png",
      ),
    ).toBe(true);
    expect(p.startsWith("/")).toBe(true);
  });

  it("keeps an Android run's goldens under the Android device pin", () => {
    expect(
      goldenPath("maestro", "blotter/seeded", "android").endsWith(
        "tests/visual/__screenshots__/android-pixel10a-37/maestro/blotter/seeded.png",
      ),
    ).toBe(true);
  });
});
