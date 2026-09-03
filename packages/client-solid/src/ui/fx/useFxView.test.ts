import { describe, expect, it } from "vitest";

import { renderFxViewHook } from "#tests/ui/pages/UseFxViewPage";

describe("useFxView", () => {
  it("throws when rendered outside a FxViewProvider", () => {
    expect(() => {
      renderFxViewHook();
    }).toThrow("useFxView must be used within a FxViewProvider");
  });
});
