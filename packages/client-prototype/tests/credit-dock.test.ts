import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { useCreditDock } from "#/credit/useCreditDock";

afterEach(cleanup);

describe("useCreditDock", () => {
  test("maximizing a right panel collapses the left form; restore clears it", () => {
    const { result } = renderHook(() => {
      return useCreditDock();
    });
    expect(result.current.leftCollapsed).toBe(false);
    act(() => {
      result.current.toggleMax("rfqs");
    });
    expect(result.current.maxPanel).toBe("rfqs");
    expect(result.current.leftCollapsed).toBe(true);
    act(() => {
      result.current.restore();
    });
    expect(result.current.maxPanel).toBe(null);
    expect(result.current.leftCollapsed).toBe(false);
  });
});
