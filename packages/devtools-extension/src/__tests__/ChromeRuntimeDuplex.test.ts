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
  let onMsg: (m: unknown) => void = () => {};
  let onDis: () => void = () => {};
  const sent: unknown[] = [];
  const state = { disconnected: false };
  const port: RuntimePort = {
    name,
    postMessage: (m) => {
      sent.push(m);
    },
    onMessage: {
      addListener: (cb) => {
        onMsg = cb;
      },
    },
    onDisconnect: {
      addListener: (cb) => {
        onDis = cb;
      },
    },
    disconnect: () => {
      state.disconnected = true;
    },
  };

  return {
    port,
    emit: (m) => {
      onMsg(m);
    },
    disconnect: () => {
      onDis();
    },
    sent,
    get disconnected() {
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
    const ports = [first, second];
    let i = 0;
    const connect = vi.fn(() => ports[i++]!.port);
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
    const ports = [first, second];
    let i = 0;
    const connect = vi.fn(() => ports[i++]!.port);
    const duplex = new ChromeRuntimeDuplex<string, number>(connect);

    duplex.dispose();
    first.disconnect();

    expect(first.disconnected).toBe(true);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
