import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useHooks } from "./useHooks";

describe("useHooks", () => {
  it("throws when rendered outside a HooksProvider", () => {
    // With no provider mounted the context is null, so the guard throws on the
    // first render. Silence React's expected error-boundary console output.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderHook(() => {
        return useHooks();
      });
    }).toThrow("useHooks must be used within HooksProvider");
    spy.mockRestore();
  });
});
