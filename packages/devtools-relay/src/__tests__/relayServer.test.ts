import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { createRelayServer, type RelayServer } from "#/relayServer";

let relay: RelayServer | null = null;

afterEach(async () => {
  await relay?.close();
  relay = null;
});

describe("createRelayServer", () => {
  it("forwards panel->app and app->panel frames", async () => {
    relay = createRelayServer({ port: 0, log: () => {} });
    const port = await relay.whenReady;

    const app = await open(`ws://127.0.0.1:${port}?role=app`);
    const panel = await open(`ws://127.0.0.1:${port}?role=panel`);

    const gotByApp = nextMessage(app);
    panel.send(JSON.stringify({ kind: "hello" }));
    expect(JSON.parse(await gotByApp)).toEqual({ kind: "hello" });

    const gotByPanel = nextMessage(panel);
    app.send(JSON.stringify({ kind: "welcome" }));
    expect(JSON.parse(await gotByPanel)).toEqual({ kind: "welcome" });

    app.close();
    panel.close();
  });

  it("broadcasts app frames to every connected panel", async () => {
    relay = createRelayServer({ port: 0, log: () => {} });
    const port = await relay.whenReady;

    const app = await open(`ws://127.0.0.1:${port}?role=app`);
    const panelA = await open(`ws://127.0.0.1:${port}?role=panel`);
    const panelB = await open(`ws://127.0.0.1:${port}?role=panel`);

    const gotA = nextMessage(panelA);
    const gotB = nextMessage(panelB);
    app.send(JSON.stringify({ kind: "batch" }));

    expect(JSON.parse(await gotA)).toEqual({ kind: "batch" });
    expect(JSON.parse(await gotB)).toEqual({ kind: "batch" });

    app.close();
    panelA.close();
    panelB.close();
  });

  it("resolves close() cleanly with live connections", async () => {
    relay = createRelayServer({ port: 0, log: () => {} });
    const port = await relay.whenReady;
    await open(`ws://127.0.0.1:${port}?role=app`);

    await expect(relay.close()).resolves.toBeUndefined();
    relay = null; // already closed; afterEach becomes a no-op
  });
});

function open(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);

    ws.on("open", () => {
      resolve(ws);
    });
    ws.on("error", reject);
  });
}

function nextMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    ws.once("message", (data) => {
      resolve(String(data));
    });
  });
}
