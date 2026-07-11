import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useFxView } from "./useFxView";

describe("useFxView", () => {
  it("throws when rendered outside a FxViewProvider", () => {
    // With no provider mounted the context is null, so the guard throws on
    // the first render. Silence React's expected error-boundary console
    // output (mirrors shell/theme/useTheme.test.tsx's equivalent guard test).
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => {
        return useFxView();
      });
    }).toThrow("useFxView must be used within a FxViewProvider");

    spy.mockRestore();
  });
});
