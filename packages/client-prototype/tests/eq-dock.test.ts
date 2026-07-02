import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { useEqDock } from "#/equities/useEqDock";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("useEqDock", () => {
  test("maximizing chart or eblot collapses the right aside; ticket/watch do not", () => {
    const { result } = renderHook(() => {
      return useEqDock();
    });
    expect(result.current.rightCollapsed).toBe(false);

    act(() => {
      result.current.toggleMax("chart");
    });
    expect(result.current.maxPanel).toBe("chart");
    expect(result.current.rightCollapsed).toBe(true);

    act(() => {
      result.current.restore();
    });
    expect(result.current.maxPanel).toBe(null);

    act(() => {
      result.current.toggleMax("ticket");
    });
    expect(result.current.rightCollapsed).toBe(false);
  });
});
