import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useThroughput } from "./useThroughput";

const DEBOUNCE_MS = 300;
const MESSAGE_DISMISS_MS = 3_000;

const okJson = (body: unknown): Response =>
  ({ ok: true, json: async () => body }) as Response;

/** Typed fetch stub: preserves the [input, init?] call tuple for PUT assertions. */
function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.fn(impl);
}

const putBody = (call: [RequestInfo | URL, RequestInit?]): unknown =>
  JSON.parse(call[1]!.body as string);

const isPut = (call: [RequestInfo | URL, RequestInit?]): boolean =>
  call[1]?.method === "PUT";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useThroughput", () => {
  it("starts loading, then seeds the value from the server", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okJson({ value: 320 })));
    const { result } = renderHook(() => useThroughput());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.value).toBe(320);
    expect(result.current.message).toBeNull();
  });

  it("stops loading even when the initial fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const { result } = renderHook(() => useThroughput());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Falls back to the default seed value.
    expect(result.current.value).toBe(100);
  });

  it("debounces the PUT and confirms success after the debounce window", async () => {
    const fetchMock = mockFetch(async () => okJson({ value: 100 }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useThroughput());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.useFakeTimers();
    act(() => result.current.setValue(500));
    // Optimistic local update is immediate.
    expect(result.current.value).toBe(500);
    // No PUT yet — still inside the debounce window.
    expect(fetchMock.mock.calls.some(isPut)).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });
    const put = fetchMock.mock.calls.find(isPut);
    expect(put).toBeDefined();
    expect(putBody(put!)).toEqual({ value: 500 });
    expect(result.current.message).toEqual({
      text: "Throughput has been set to 500",
      isError: false,
    });
  });

  it("collapses rapid edits into a single PUT for the final value", async () => {
    const fetchMock = mockFetch(async () => okJson({ value: 100 }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useThroughput());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.useFakeTimers();
    act(() => result.current.setValue(200));
    act(() => result.current.setValue(300));
    act(() => result.current.setValue(400));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });
    const puts = fetchMock.mock.calls.filter(isPut);
    expect(puts).toHaveLength(1);
    expect(putBody(puts[0])).toEqual({ value: 400 });
  });

  it("reports an error banner when the PUT is rejected by the server", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson({ value: 100 }))
      .mockResolvedValueOnce({ ok: false } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useThroughput());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.useFakeTimers();
    act(() => result.current.setValue(700));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });
    expect(result.current.message).toEqual({
      text: "Error setting throughput",
      isError: true,
    });
  });

  it("auto-dismisses the status banner after the dismiss delay", async () => {
    const fetchMock = vi.fn(async () => okJson({ value: 100 }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useThroughput());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.useFakeTimers();
    act(() => result.current.setValue(150));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });
    expect(result.current.message).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MESSAGE_DISMISS_MS);
    });
    expect(result.current.message).toBeNull();
  });

  it("ignores a resolved initial fetch after unmount (cancelled guard)", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const pending = new Promise<Response>((res) => {
      resolveFetch = res;
    });
    vi.stubGlobal("fetch", vi.fn(() => pending));
    const { result, unmount } = renderHook(() => useThroughput());
    expect(result.current.loading).toBe(true);

    // Unmount before the fetch resolves, then resolve — the cancelled guard
    // must suppress the post-unmount state writes (no act warning, no throw).
    unmount();
    await act(async () => {
      resolveFetch(okJson({ value: 999 }));
      await pending;
    });
  });

  it("ignores a rejected initial fetch after unmount (cancelled catch guard)", async () => {
    let rejectFetch: (e: unknown) => void = () => {};
    const pending = new Promise<Response>((_res, rej) => {
      rejectFetch = rej;
    });
    vi.stubGlobal("fetch", vi.fn(() => pending));
    const { unmount } = renderHook(() => useThroughput());

    unmount();
    await act(async () => {
      rejectFetch(new Error("late failure"));
      await pending.catch(() => {});
    });
  });

  it("clears pending timers on unmount", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okJson({ value: 100 })));
    const { result, unmount } = renderHook(() => useThroughput());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    act(() => result.current.setValue(250));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
