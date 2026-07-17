import { describe, expect, it } from "vitest";

import { resolveAmbientEnabled } from "./resolveAmbientEnabled";

describe("resolveAmbientEnabled", () => {
  it("is on only when the preference is on and reduced-motion is off", () => {
    expect(resolveAmbientEnabled(true, false)).toBe(true);
    expect(resolveAmbientEnabled(true, true)).toBe(false);
    expect(resolveAmbientEnabled(false, false)).toBe(false);
    expect(resolveAmbientEnabled(false, true)).toBe(false);
  });
});
