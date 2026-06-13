import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useNotional } from "./useNotional";

describe("useNotional", () => {
  it("initialises from the default notional, formatted with commas", () => {
    const { result } = renderHook(() => useNotional(1_000_000));
    expect(result.current.displayValue).toBe("1,000,000");
    expect(result.current.numericValue).toBe(1_000_000);
    expect(result.current.isDefault).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.isRfq).toBe(false);
  });

  it("flags an RFQ when the default already exceeds the threshold", () => {
    const { result } = renderHook(() => useNotional(10_000_000));
    expect(result.current.isRfq).toBe(true);
  });

  it("parses a valid edit and reformats it", () => {
    const { result } = renderHook(() => useNotional(1_000_000));
    act(() => result.current.onChange("2500"));
    expect(result.current.numericValue).toBe(2_500);
    expect(result.current.displayValue).toBe("2,500");
    expect(result.current.isDefault).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("expands k/m suffixes and flags an RFQ above the threshold", () => {
    const { result } = renderHook(() => useNotional(1_000_000));
    act(() => result.current.onChange("20m"));
    expect(result.current.numericValue).toBe(20_000_000);
    expect(result.current.isRfq).toBe(true);
  });

  it("marks the value as default again when an edit matches the default", () => {
    const { result } = renderHook(() => useNotional(1_000_000));
    act(() => result.current.onChange("500"));
    expect(result.current.isDefault).toBe(false);
    act(() => result.current.onChange("1000000"));
    expect(result.current.isDefault).toBe(true);
  });

  it("records the raw input and an error when parsing fails", () => {
    const { result } = renderHook(() => useNotional(1_000_000));
    act(() => result.current.onChange("abc"));
    expect(result.current.numericValue).toBe(0);
    expect(result.current.displayValue).toBe("abc");
    expect(result.current.error).toBe("Invalid input");
    expect(result.current.isRfq).toBe(false);
    expect(result.current.isDefault).toBe(false);
  });

  it("surfaces a max-exceeded error while keeping the parsed value", () => {
    const { result } = renderHook(() => useNotional(1_000_000));
    act(() => result.current.onChange("2000m"));
    expect(result.current.error).toBe("Max exceeded");
    expect(result.current.numericValue).toBe(2_000_000_000);
  });

  it("reset() returns to the formatted default", () => {
    const { result } = renderHook(() => useNotional(1_000_000));
    act(() => result.current.onChange("123"));
    act(() => result.current.reset());
    expect(result.current.displayValue).toBe("1,000,000");
    expect(result.current.numericValue).toBe(1_000_000);
    expect(result.current.isDefault).toBe(true);
    expect(result.current.error).toBeNull();
  });
});
