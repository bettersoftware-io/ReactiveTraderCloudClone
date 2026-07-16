// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { PROTOCOL_VERSION } from "@rtc/devtools-core";

import { createPanelSession } from "#/panel/panelSession";
import type { RuntimePort } from "#/ports";

describe("createPanelSession", () => {
  it("sends hello on start and reflects a welcome in the store", async () => {
    const f = fakePort();
    const session = createPanelSession(() => {
      return f.port;
    });

    // InspectorClient.start() (called by createPanelSession) sends hello.
    expect(f.sent).toContainEqual({ kind: "hello", v: PROTOCOL_VERSION });

    f.emit({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-web" });

    await vi.waitFor(() => {
      expect(session.store.getSnapshot().connected).toBe(true);
      expect(session.store.getSnapshot().appId).toBe("rtc-web");
    });

    session.dispose();
  });

  it("sends intent:invoke over the transport when invokeIntent is called", () => {
    const f = fakePort();
    const session = createPanelSession(() => {
      return f.port;
    });

    session.invokeIntent("machine-1", "reset", [42]);

    expect(f.sent).toContainEqual({
      kind: "intent:invoke",
      machineId: "machine-1",
      name: "reset",
      args: [42],
    });

    session.dispose();
  });
});

interface FakePort {
  port: RuntimePort;
  emit(msg: unknown): void;
  sent: unknown[];
}

function fakePort(): FakePort {
  let onMsg: ((m: unknown) => void) | undefined;
  const sent: unknown[] = [];

  return {
    port: {
      name: "rtc-panel:1",
      postMessage: (m: unknown): void => {
        sent.push(m);
      },
      onMessage: {
        addListener: (cb: (m: unknown) => void): void => {
          onMsg = cb;
        },
      },
      onDisconnect: {
        addListener: (): void => {},
      },
      disconnect: (): void => {},
    },
    emit: (m: unknown): void => {
      onMsg?.(m);
    },
    sent,
  };
}
