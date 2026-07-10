import { describe, expect, it } from "vitest";

import { SPACING } from "#/ui/theme/spacing";

describe("SPACING", () => {
  it("is a 4pt-based ramp covering the values in use", () => {
    expect(SPACING).toEqual({ xs: 4, sm: 8, md: 12, lg: 14, xl: 20 });
  });
});
