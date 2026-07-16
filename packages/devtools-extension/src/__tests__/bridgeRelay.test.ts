import { describe, expect, it } from "vitest";

import type { BridgeChannel } from "#/bridgeRelay";
import { createBridgeRelay } from "#/bridgeRelay";
import type { RuntimePort } from "#/ports";

function fakeChannel(): {
  channel: BridgeChannel;
  emit(msg: unknown): void;
  posted: unknown[];
  closed: boolean;
} {
  let onMsg: (m: unknown) => void = (): void => {};
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
      onMsg(m);
    },
    posted,
    get closed(): boolean {
      return state.closed;
    },
  };
}

function fakePort(): {
  port: RuntimePort;
  emit(msg: unknown): void;
  fireDisconnect(): void;
  sent: unknown[];
} {
  let onMsg: (m: unknown) => void = (): void => {};
  let onDis: () => void = (): void => {};
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
      onMsg(m);
    },
    fireDisconnect: (): void => {
      onDis();
    },
    sent,
  };
}

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

  it("closes the channel when the port disconnects", () => {
    const ch = fakeChannel();
    const p = fakePort();
    createBridgeRelay({ channel: ch.channel, port: p.port });

    p.fireDisconnect();

    expect(ch.closed).toBe(true);
  });
});
