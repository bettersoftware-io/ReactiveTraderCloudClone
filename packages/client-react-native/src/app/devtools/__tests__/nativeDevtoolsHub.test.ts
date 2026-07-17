import { afterEach, describe, expect, it } from "vitest";

import { createNativeDevtoolsHub } from "#/app/devtools/nativeDevtoolsHub";

import { SilentSocket } from "./SilentSocket.testHelpers";

describe("createNativeDevtoolsHub", () => {
  const sockets: SilentSocket[] = [];

  afterEach(() => {
    sockets.length = 0;
  });

  it("wires an app-tagged WsRelayDuplex at the given relay url", () => {
    const hub = createNativeDevtoolsHub("ws://localhost:8790", (url) => {
      const socket = new SilentSocket(url);
      sockets.push(socket);

      return socket;
    });

    const socket = sockets[0];

    if (socket === undefined) {
      throw new Error("expected a socket");
    }

    expect(sockets).toHaveLength(1);
    expect(socket.url).toBe("ws://localhost:8790?role=app");
    expect(typeof hub.dispose).toBe("function");

    hub.dispose();
  });
});
