import { describe, it, expect } from "vitest";
import { type ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { ConnectionStatus } from "@rtc/domain";
import { HooksProvider } from "../../hooks/HooksProvider";
import type { AppHooks } from "../../hooks/createAppHooks";
import { useStaleDetection } from "./useStaleDetection";

/**
 * Minimal AppHooks whose only live member is useConnectionStatus, fed from a
 * mutable holder so a test can change the reported status between renders.
 */
function makeHooks(getStatus: () => ConnectionStatus): AppHooks {
  return {
    useConnectionStatus: () => getStatus(),
  } as unknown as AppHooks;
}

function wrapperFor(getStatus: () => ConnectionStatus) {
  const hooks = makeHooks(getStatus);
  return ({ children }: { children: ReactNode }) => (
    <HooksProvider hooks={hooks}>{children}</HooksProvider>
  );
}

describe("useStaleDetection", () => {
  it("is fresh while the connection stays up", () => {
    let status = ConnectionStatus.CONNECTED;
    const { result, rerender } = renderHook((value: unknown) => useStaleDetection(value), {
      wrapper: wrapperFor(() => status),
      initialProps: "a" as unknown,
    });
    expect(result.current).toBe(false);
    rerender("b");
    expect(result.current).toBe(false);
  });

  it("becomes stale after a disconnect/reconnect with no new data", () => {
    let status: ConnectionStatus = ConnectionStatus.CONNECTED;
    const data = { v: 1 };
    const { result, rerender } = renderHook((value: unknown) => useStaleDetection(value), {
      wrapper: wrapperFor(() => status),
      initialProps: data as unknown,
    });
    expect(result.current).toBe(false);

    status = ConnectionStatus.DISCONNECTED;
    rerender(data);
    expect(result.current).toBe(false);

    status = ConnectionStatus.CONNECTED;
    rerender(data);
    expect(result.current).toBe(true);
  });

  it("clears the stale flag when a fresh value reference arrives", () => {
    let status: ConnectionStatus = ConnectionStatus.CONNECTED;
    const first = { v: 1 };
    const { result, rerender } = renderHook((value: unknown) => useStaleDetection(value), {
      wrapper: wrapperFor(() => status),
      initialProps: first as unknown,
    });

    status = ConnectionStatus.DISCONNECTED;
    rerender(first);
    status = ConnectionStatus.CONNECTED;
    rerender(first);
    expect(result.current).toBe(true);

    // A new reference signals fresh data → no longer stale.
    rerender({ v: 2 });
    expect(result.current).toBe(false);
  });

  it("treats an idle disconnect as a connection loss", () => {
    let status: ConnectionStatus = ConnectionStatus.CONNECTED;
    const data = { v: 1 };
    const { result, rerender } = renderHook((value: unknown) => useStaleDetection(value), {
      wrapper: wrapperFor(() => status),
      initialProps: data as unknown,
    });

    status = ConnectionStatus.IDLE_DISCONNECTED;
    rerender(data);
    status = ConnectionStatus.CONNECTED;
    rerender(data);
    expect(result.current).toBe(true);
  });
});
