import { renderHook } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { useCreditView } from "./useCreditView";

describe("useCreditView", () => {
  it("throws when rendered outside a CreditViewProvider", () => {
    expect(() => {
      renderHook(() => {
        return useCreditView();
      });
    }).toThrow("useCreditView must be used within a CreditViewProvider");
  });
});
