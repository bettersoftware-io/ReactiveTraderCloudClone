import { describe, expect, it } from "vitest";

import { FONT_ORBITRON_WORDMARK } from "#/ui/theme/fontFamilies";

describe("Orbitron wordmark", () => {
  it("exposes a bare family-name constant", () => {
    expect(FONT_ORBITRON_WORDMARK).toBe("Orbitron_700Bold");
  });
});
