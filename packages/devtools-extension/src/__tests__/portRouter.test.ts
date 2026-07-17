import { describe, expect, it } from "vitest";

import { createPortRouter } from "#/portRouter";
import type { RuntimePort } from "#/ports";

describe("createPortRouter", () => {
  it("relays panel→content and content→panel for the same tab", () => {
    const router = createPortRouter();
    const panel = fakePort("rtc-panel:7");
    const content = fakePort("rtc-content");

    router.connectPanel(7, panel.port);
    router.connectContent(7, content.port);

    panel.emit({ kind: "hello" });
    content.emit({ kind: "welcome" });

    expect(content.sent).toEqual([{ kind: "hello" }]);
    expect(panel.sent).toEqual([{ kind: "welcome" }]);
  });

  it("keeps tabs isolated", () => {
    const router = createPortRouter();
    const panelA = fakePort("rtc-panel:1");
    const contentA = fakePort("rtc-content");
    const contentB = fakePort("rtc-content");

    router.connectPanel(1, panelA.port);
    router.connectContent(1, contentA.port);
    router.connectContent(2, contentB.port);

    panelA.emit({ n: 1 });

    expect(contentA.sent).toEqual([{ n: 1 }]);
    expect(contentB.sent).toEqual([]);
  });

  it("on panel disconnect, disconnects the content sibling", () => {
    const router = createPortRouter();
    const panel = fakePort("rtc-panel:5");
    const content = fakePort("rtc-content");

    router.connectPanel(5, panel.port);
    router.connectContent(5, content.port);

    panel.fireDisconnect();

    expect(content.disconnected).toBe(true);
  });
});

interface FakePort {
  port: RuntimePort;
  emit(msg: unknown): void;
  fireDisconnect(): void;
  sent: unknown[];
  disconnected: boolean;
}

function fakePort(name: string): FakePort {
  let onMsg: ((m: unknown) => void) | undefined;
  let onDis: (() => void) | undefined;
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
      onMsg?.(m);
    },
    fireDisconnect: (): void => {
      onDis?.();
    },
    sent,
    get disconnected(): boolean {
      return state.disconnected;
    },
  };
}
