import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  ExecutionStatus,
  TradeStatus,
  Direction,
  TOO_LONG_THRESHOLD_MS,
  EXECUTION_TIMEOUT_MS,
  CONFIRMATION_DISMISS_MS,
  type Trade,
} from "@rtc/domain";
import { useTileState } from "./useTileState";

const trade = (): Trade => ({
  tradeId: 1,
  tradeName: "t",
  currencyPair: "EURUSD",
  notional: 1_000_000,
  dealtCurrency: "EUR",
  direction: Direction.Buy,
  spotRate: 1.09,
  status: TradeStatus.Done,
  tradeDate: "2026-06-13",
  valueDate: "2026-06-15",
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTileState", () => {
  it("starts in the ready state", () => {
    const { result } = renderHook(() => useTileState());
    expect(result.current.state).toEqual({ status: "ready" });
  });

  it("enters the started state on start()", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTileState());
    act(() => result.current.start());
    expect(result.current.state.status).toBe("started");
  });

  it("escalates to tooLong after the too-long threshold", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTileState());
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(TOO_LONG_THRESHOLD_MS));
    expect(result.current.state.status).toBe("tooLong");
  });

  it("escalates to timeout after the execution timeout, then auto-dismisses", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTileState());
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(EXECUTION_TIMEOUT_MS));
    expect(result.current.state.status).toBe("timeout");
    act(() => vi.advanceTimersByTime(CONFIRMATION_DISMISS_MS));
    expect(result.current.state.status).toBe("ready");
  });

  it("finishing before tooLong cancels the escalation timers", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTileState());
    act(() => result.current.start());
    act(() => result.current.finish(ExecutionStatus.Done, trade()));
    expect(result.current.state).toMatchObject({
      status: "finished",
      executionStatus: ExecutionStatus.Done,
    });
    // Advancing past the old too-long timer must not flip back to tooLong.
    act(() => vi.advanceTimersByTime(TOO_LONG_THRESHOLD_MS + EXECUTION_TIMEOUT_MS));
    // After the dismiss delay it returns to ready.
    expect(result.current.state.status).toBe("ready");
  });

  it("auto-dismisses a finished confirmation after the dismiss delay", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTileState());
    act(() => result.current.finish(ExecutionStatus.Rejected));
    expect(result.current.state.status).toBe("finished");
    act(() => vi.advanceTimersByTime(CONFIRMATION_DISMISS_MS));
    expect(result.current.state.status).toBe("ready");
  });

  it("dismiss() returns to ready immediately and clears timers", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTileState());
    act(() => result.current.start());
    act(() => result.current.dismiss());
    expect(result.current.state.status).toBe("ready");
    // No pending timer should re-enter started/tooLong.
    act(() => vi.advanceTimersByTime(EXECUTION_TIMEOUT_MS + CONFIRMATION_DISMISS_MS));
    expect(result.current.state.status).toBe("ready");
  });

  it("keeps a finished status if the timeout timer fires after finishing", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTileState());
    act(() => result.current.start());
    // Pass tooLong but not the full timeout, then finish.
    act(() => vi.advanceTimersByTime(TOO_LONG_THRESHOLD_MS));
    expect(result.current.state.status).toBe("tooLong");
    act(() => result.current.finish(ExecutionStatus.Done, trade()));
    expect(result.current.state.status).toBe("finished");
  });

  it("clears timers on unmount", () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const { result, unmount } = renderHook(() => useTileState());
    act(() => result.current.start());
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
