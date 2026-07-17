import { describe, expect, it } from "vitest";

import type { BridgeChannel } from "#/bridgeRelay";
import { createBridgeRelay } from "#/bridgeRelay";
import type { RuntimePort } from "#/ports";

describe("createBridgeRelay", () => {
  it("forwards channel messages (from the app hub) to the port", () => {
    const ch = fakeChannel();
    const p = fakePort();
    createBridgeRelay({ channel: ch.channel, port: p.port });

    ch.emit({ kind: "welcome" });

    expect(p.sent).toEqual([{ kind: "welcome" }]);
  });

  it("forwards port messages (from the panel) to the channel", () => {
    const ch = fakeChannel();
    const p = fakePort();
    createBridgeRelay({ channel: ch.channel, port: p.port });

    p.emit({ kind: "hello" });

    expect(ch.posted).toEqual([{ kind: "hello" }]);
  });

  it("invokes onPortDisconnect and does not close the channel when the port disconnects", () => {
    const ch = fakeChannel();
    const p = fakePort();
    let disconnectCount = 0;
    createBridgeRelay({
      channel: ch.channel,
      port: p.port,
      onPortDisconnect: (): void => {
        disconnectCount += 1;
      },
    });

    p.fireDisconnect();

    expect(disconnectCount).toBe(1);
    expect(ch.closed).toBe(false);
  });

  it("closes the channel on dispose()", () => {
    const ch = fakeChannel();
    const p = fakePort();
    const handle = createBridgeRelay({ channel: ch.channel, port: p.port });

    handle.dispose();

    expect(ch.closed).toBe(true);
  });

  it("reconnects to a new port after a disconnect, keeping the same channel alive", () => {
    const ch = fakeChannel();
    const portA = fakePort();
    const portB = fakePort();

    createBridgeRelay({
      channel: ch.channel,
      port: portA.port,
      onPortDisconnect: (): void => {
        createBridgeRelay({ channel: ch.channel, port: portB.port });
      },
    });

    portA.fireDisconnect();
    ch.emit({ kind: "welcome" });

    expect(portB.sent).toEqual([{ kind: "welcome" }]);
    expect(portA.sent).toEqual([]);
  });
});

interface FakeChannel {
  channel: BridgeChannel;
  emit(msg: unknown): void;
  posted: unknown[];
  closed: boolean;
}

interface FakePort {
  port: RuntimePort;
  emit(msg: unknown): void;
  fireDisconnect(): void;
  sent: unknown[];
}

function fakeChannel(): FakeChannel {
  let onMsg: ((m: unknown) => void) | undefined;
  const posted: unknown[] = [];
  const state = { closed: false };

  return {
    channel: {
      postMessage: (m: unknown): void => {
        posted.push(m);
      },
      addMessageListener: (cb: (m: unknown) => void): void => {
        onMsg = cb;
      },
      close: (): void => {
        state.closed = true;
      },
    },
    emit: (m: unknown): void => {
      onMsg?.(m);
    },
    posted,
    get closed(): boolean {
      return state.closed;
    },
  };
}

function fakePort(): FakePort {
  let onMsg: ((m: unknown) => void) | undefined;
  let onDis: (() => void) | undefined;
  const sent: unknown[] = [];

  return {
    port: {
      name: "rtc-content",
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
      disconnect: (): void => {},
    },
    emit: (m: unknown): void => {
      onMsg?.(m);
    },
    fireDisconnect: (): void => {
      onDis?.();
    },
    sent,
  };
}
