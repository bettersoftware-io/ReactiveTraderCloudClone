import { describe, expect, it } from "vitest";

import {
  type ClosableSocket,
  createSessionRegistry,
} from "#/accounts/sessionRegistry";

describe("sessionRegistry", () => {
  it("closes each registered socket once with 4401 / session_ended", () => {
    const registry = createSessionRegistry();
    const a = createSocket();
    const b = createSocket();
    const other = createSocket();
    registry.register("acc-1", a);
    registry.register("acc-1", b);
    registry.register("acc-2", other);

    expect(registry.closeAll("acc-1")).toBe(2);
    expect(a.closes).toEqual([[4401, "session_ended"]]);
    expect(b.closes).toEqual([[4401, "session_ended"]]);
    expect(other.closes).toEqual([]);
  });

  it("an account never ended reads epoch 0; each end moves it up, from one shared counter", () => {
    const registry = createSessionRegistry();

    expect(registry.epochOf("acc-1")).toBe(0);

    registry.closeAll("acc-1");
    const first = registry.epochOf("acc-1");
    registry.closeAll("acc-2");
    const other = registry.epochOf("acc-2");
    registry.closeAll("acc-1");

    expect(first).toBeGreaterThan(0);
    expect(other).toBeGreaterThan(first);
    expect(registry.epochOf("acc-1")).toBeGreaterThan(other);
  });

  it("bumps the epoch before closing sockets, so a close handler sees the new one", () => {
    const registry = createSessionRegistry();
    const seen: number[] = [];
    registry.register("acc-1", {
      close: (): void => {
        seen.push(registry.epochOf("acc-1"));
      },
    });

    registry.closeAll("acc-1");

    expect(seen).toEqual([registry.epochOf("acc-1")]);
    expect(seen[0]).toBeGreaterThan(0);
  });

  it("keeps the epoch map bounded, and an evicted account reads 0 (never above a capture)", () => {
    const registry = createSessionRegistry(2);

    registry.closeAll("acc-1");
    registry.closeAll("acc-2");
    registry.closeAll("acc-3");

    expect(registry.epochOf("acc-1")).toBe(0);
    expect(registry.epochOf("acc-2")).toBeGreaterThan(0);
    expect(registry.epochOf("acc-3")).toBeGreaterThan(0);
  });

  it("does not close an unregistered socket", () => {
    const registry = createSessionRegistry();
    const gone = createSocket();
    const kept = createSocket();
    const unregister = registry.register("acc-1", gone);
    registry.register("acc-1", kept);

    unregister();

    expect(registry.closeAll("acc-1")).toBe(1);
    expect(gone.closes).toEqual([]);
    expect(kept.closes).toHaveLength(1);
  });

  it("answers 0 for an unknown account, and after the last socket left", () => {
    const registry = createSessionRegistry();
    expect(registry.closeAll("nobody")).toBe(0);

    registry.register("acc-1", createSocket())();
    expect(registry.closeAll("acc-1")).toBe(0);
  });

  it("keeps closing the rest when one socket's close throws", () => {
    const registry = createSessionRegistry();
    const first = createSocket();
    const broken: ClosableSocket = {
      close: (): void => {
        throw new Error("already closed");
      },
    };
    const last = createSocket();
    registry.register("acc-1", first);
    registry.register("acc-1", broken);
    registry.register("acc-1", last);

    expect(registry.closeAll("acc-1")).toBe(2);
    expect(first.closes).toHaveLength(1);
    expect(last.closes).toHaveLength(1);
  });
});

interface RecordingSocket extends ClosableSocket {
  readonly closes: [number, string][];
}

function createSocket(): RecordingSocket {
  const closes: [number, string][] = [];

  return {
    closes,
    close(code: number, reason: string): void {
      closes.push([code, reason]);
    },
  };
}
