import { describe, expect, it, vi } from "vitest";

import { ChromeRuntimeDuplex } from "#/ChromeRuntimeDuplex";
import type { RuntimePort } from "#/ports";

function makeFakePort(name = "p"): {
  port: RuntimePort;
  emit(msg: unknown): void;
  disconnect(): void;
  sent: unknown[];
  disconnected: boolean;
} {
  let onMsg: (m: unknown) => void = (): void => {};
  let onDis: () => void = (): void => {};
  const sent: unknown[] = [];
  const state = { disconnected: false };
  const port: RuntimePort = {
    name,
    postMessage: (m: unknown): void => {
      sent.push(m);
    },
    onMessage: {
      addListener: (cb: (m: unknown) => void): void => {
        onMsg = cb;
      },
    },
    onDisconnect: {
      addListener: (cb: () => void): void => {
        onDis = cb;
      },
    },
    disconnect: (): void => {
      state.disconnected = true;
    },
  };

  return {
    port,
    emit: (m: unknown): void => {
      onMsg(m);
    },
    disconnect: (): void => {
      onDis();
    },
    sent,
    get disconnected(): boolean {
      return state.disconnected;
    },
  };
}

describe("ChromeRuntimeDuplex", () => {
  it("sends via the port and surfaces inbound messages on inbound$", () => {
    const f = makeFakePort();
    const connect = vi.fn(() => f.port);
    const duplex = new ChromeRuntimeDuplex<string, number>(connect);

    const got: number[] = [];
    duplex.inbound$.subscribe((m) => {
      got.push(m);
    });

    duplex.send("hello");
    f.emit(42);

    expect(f.sent).toEqual(["hello"]);
    expect(got).toEqual([42]);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("reconnects on disconnect and keeps delivering inbound", () => {
    const first = makeFakePort("first");
    const second = makeFakePort("second");
    const queue = [first.port, second.port];
    const connect = vi.fn((): RuntimePort => {
      const next = queue.shift();

      if (!next) {
        throw new Error("connect called more times than ports available");
      }

      return next;
    });
    const duplex = new ChromeRuntimeDuplex<string, number>(connect);

    const got: number[] = [];
    duplex.inbound$.subscribe((m) => {
      got.push(m);
    });

    first.emit(1);
    first.disconnect(); // SW died — duplex should reconnect
    second.emit(2);

    expect(got).toEqual([1, 2]);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("does not reconnect after dispose", () => {
    const first = makeFakePort("first");
    const second = makeFakePort("second");
    const queue = [first.port, second.port];
    const connect = vi.fn((): RuntimePort => {
      const next = queue.shift();

      if (!next) {
        throw new Error("connect called more times than ports available");
      }

      return next;
    });
    const duplex = new ChromeRuntimeDuplex<string, number>(connect);

    duplex.dispose();
    first.disconnect();

    expect(first.disconnected).toBe(true);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
