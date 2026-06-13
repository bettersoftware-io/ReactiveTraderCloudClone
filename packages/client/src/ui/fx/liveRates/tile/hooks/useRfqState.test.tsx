import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRfqState, type RfqQuote } from "./useRfqState";

const quote = (over: Partial<RfqQuote> = {}): RfqQuote => ({
  bid: 1.0921,
  ask: 1.0925,
  timeoutMs: 10_000,
  ...over,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useRfqState", () => {
  it("starts in the init state", () => {
    const { result } = renderHook(() => useRfqState());
    expect(result.current.state).toEqual({ status: "init", quote: null, remainingMs: 0 });
  });

  it("initiate() moves to requested only from init", () => {
    const { result } = renderHook(() => useRfqState());
    act(() => result.current.initiate());
    expect(result.current.state.status).toBe("requested");
    // A second initiate while requested is ignored.
    act(() => result.current.initiate());
    expect(result.current.state.status).toBe("requested");
  });

  it("cancel() returns to init only from requested", () => {
    const { result } = renderHook(() => useRfqState());
    act(() => result.current.initiate());
    act(() => result.current.cancel());
    expect(result.current.state.status).toBe("init");
    // cancel from init is a no-op.
    act(() => result.current.cancel());
    expect(result.current.state.status).toBe("init");
  });

  it("receiveQuote() enters received and decrements remainingMs over time", () => {
    // Fake timers also mock Date, so advancing the clock moves Date.now() in
    // lock-step with the countdown interval — no explicit setSystemTime needed.
    vi.useFakeTimers();
    const { result } = renderHook(() => useRfqState());
    act(() => result.current.receiveQuote(quote()));
    expect(result.current.state.status).toBe("received");
    expect(result.current.state.remainingMs).toBe(10_000);
    act(() => vi.advanceTimersByTime(3_000));
    expect(result.current.state.remainingMs).toBeLessThanOrEqual(7_000);
    expect(result.current.state.remainingMs).toBeGreaterThan(6_000);
  });

  it("auto-rejects when the countdown expires, then returns to init", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRfqState());
    act(() => result.current.receiveQuote(quote({ timeoutMs: 1_000 })));
    act(() => vi.advanceTimersByTime(1_100));
    expect(result.current.state.status).toBe("rejected");
    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current.state.status).toBe("init");
  });

  it("reject() moves to rejected only from received", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRfqState());
    // reject from init is a no-op.
    act(() => result.current.reject());
    expect(result.current.state.status).toBe("init");
    act(() => result.current.receiveQuote(quote()));
    act(() => result.current.reject());
    expect(result.current.state.status).toBe("rejected");
  });

  it("accept() returns the quote and resets to init from received", () => {
    vi.useFakeTimers();
    const q = quote();
    const { result } = renderHook(() => useRfqState());
    act(() => result.current.receiveQuote(q));
    let accepted: RfqQuote | null = null;
    act(() => {
      accepted = result.current.accept();
    });
    expect(accepted).toEqual(q);
    expect(result.current.state.status).toBe("init");
  });

  it("accept() returns null when not in the received state", () => {
    const { result } = renderHook(() => useRfqState());
    let accepted: RfqQuote | null = quote();
    act(() => {
      accepted = result.current.accept();
    });
    expect(accepted).toBeNull();
  });

  it("clears timers on unmount", () => {
    vi.useFakeTimers();
    const clearInterval = vi.spyOn(globalThis, "clearInterval");
    const { result, unmount } = renderHook(() => useRfqState());
    act(() => result.current.receiveQuote(quote()));
    unmount();
    expect(clearInterval).toHaveBeenCalled();
  });
});
