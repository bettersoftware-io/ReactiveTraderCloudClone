import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useTheme } from "./useTheme";

describe("useTheme", () => {
  it("throws when rendered outside a ThemeProvider", () => {
    // With no provider mounted the context is null, so the guard throws on the
    // first render. Silence React's expected error-boundary console output.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderHook(() => {
        return useTheme();
      });
    }).toThrow("useTheme must be used within ThemeProvider");
    spy.mockRestore();
  });
});
