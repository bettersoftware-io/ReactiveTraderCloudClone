import { describe, expect, it, vi } from "vitest";

import { renderCreditViewHook } from "#tests/ui/pages/UseCreditViewPage";

describe("useCreditView", () => {
  it("throws when rendered outside a CreditViewProvider", () => {
    // With no provider mounted the context is null, so the guard throws on
    // the first render. Silence React's expected error-boundary console
    // output (mirrors useTheme.test.tsx).
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderCreditViewHook();
    }).toThrow("useCreditView must be used within a CreditViewProvider");
    spy.mockRestore();
  });
});
