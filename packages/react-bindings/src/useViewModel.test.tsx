import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useViewModel } from "#/useViewModel";

describe("useViewModel", () => {
  it("throws when rendered outside a ViewModelProvider", () => {
    // With no provider mounted the context is null, so the guard throws on the
    // first render. Silence React's expected error-boundary console output.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderHook(() => {
        return useViewModel();
      });
    }).toThrow("useViewModel must be used within ViewModelProvider");
    spy.mockRestore();
  });
});
