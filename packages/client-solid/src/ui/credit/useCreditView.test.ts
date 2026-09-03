import { describe, expect, it } from "vitest";

import { renderCreditViewHook } from "#tests/ui/pages/UseCreditViewPage";

describe("useCreditView", () => {
  it("throws when rendered outside a CreditViewProvider", () => {
    expect(() => {
      renderCreditViewHook();
    }).toThrow("useCreditView must be used within a CreditViewProvider");
  });
});
