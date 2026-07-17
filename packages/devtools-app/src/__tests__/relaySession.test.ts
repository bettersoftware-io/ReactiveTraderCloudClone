// @vitest-environment node

import { describe, expect, it } from "vitest";

import { PROTOCOL_VERSION } from "@rtc/devtools-core";

import { createRelayInspectorSession } from "#/relaySession";

import { FakeSocket } from "./FakeSocket.testHelpers";

describe("createRelayInspectorSession", () => {
  it("connects a panel-tagged relay socket, sends hello, and reflects welcome", () => {
    // A boxed reference, not a bare closed-over `let` — TypeScript's
    // control-flow analysis collapses a `let` mutated inside a callback
    // passed to a doubly-nested closure (describe > it) down to `never` once
    // guarded against `null`, even though the callback runs synchronously.
    // Mutating a property instead of the binding itself sidesteps that.
    const box = createSocketBox();
    const session = createRelayInspectorSession(
      "ws://localhost:8790",
      (url) => {
        box.socket = new FakeSocket(url);

        return box.socket;
      },
    );

    const live = box.socket;

    if (live === null) {
      throw new Error("socket was not created");
    }

    expect(live.url).toBe("ws://localhost:8790?role=panel");

    live.open(); // flush the buffered hello
    expect(
      live.sent.some((frame) => {
        return frame.includes('"hello"');
      }),
    ).toBe(true);

    live.receive({ kind: "welcome", v: PROTOCOL_VERSION, appId: "rtc-native" });

    const snapshot = session.store.getSnapshot();
    expect(snapshot.connected).toBe(true);
    expect(snapshot.appId).toBe("rtc-native");

    session.dispose();
  });
});

interface SocketBox {
  socket: FakeSocket | null;
}

function createSocketBox(): SocketBox {
  return { socket: null };
}
