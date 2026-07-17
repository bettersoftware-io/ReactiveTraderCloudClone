import type { IncomingMessage } from "node:http";

import type { RawData, WebSocket } from "ws";
import { WebSocketServer } from "ws";

export interface RelayServerOptions {
  port: number;
  log?: (message: string) => void;
}

export interface RelayServer {
  /** Resolves with the actually-bound port once listening. Pass `port: 0` for
   * an ephemeral port in tests, then await this to learn it. */
  readonly whenReady: Promise<number>;
  close(): Promise<void>;
}

type Role = "app" | "panel";

function roleFromRequest(req: IncomingMessage): Role {
  const url = req.url ?? "";
  const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  const role = new URLSearchParams(query).get("role");

  return role === "app" ? "app" : "panel";
}

/** A tiny standalone WebSocket relay for devtools traffic. It identifies each
 * connection as app or panel (from the `?role=` query the WsRelayDuplex adds),
 * forwards app->panel(s) and panel->app, and supports multiple panels attached
 * to one app (broadcast app->panels). Stateless beyond the current app/panel
 * connections: it holds no protocol knowledge, it only pipes frames — the
 * devtools equivalent of the Chrome-extension background router, over sockets.
 * It carries only devtools frames on the dev machine, never the app's data
 * socket or the production @rtc/server. */
export function createRelayServer(options: RelayServerOptions): RelayServer {
  const log =
    options.log ??
    ((message: string): void => {
      console.log(`[devtools-relay] ${message}`);
    });

  const wss = new WebSocketServer({ port: options.port });
  let app: WebSocket | null = null;
  const panels = new Set<WebSocket>();

  const whenReady = new Promise<number>((resolve, reject) => {
    wss.on("listening", () => {
      const address = wss.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 0;

      log(`listening on ws://localhost:${port}`);
      resolve(port);
    });
    wss.on("error", reject);
  });

  wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
    const role = roleFromRequest(req);

    if (role === "app") {
      app = socket;
      log("app connected");

      socket.on("message", (data: RawData) => {
        const frame = String(data);

        for (const panel of panels) {
          panel.send(frame);
        }
      });

      socket.on("close", () => {
        if (app === socket) {
          app = null;
        }

        log("app disconnected");
      });

      return;
    }

    panels.add(socket);
    log(`panel connected (${panels.size} total)`);

    socket.on("message", (data: RawData) => {
      app?.send(String(data));
    });

    socket.on("close", () => {
      panels.delete(socket);
      log(`panel disconnected (${panels.size} total)`);
    });
  });

  return {
    whenReady,
    close(): Promise<void> {
      return new Promise((resolve) => {
        for (const panel of panels) {
          panel.close();
        }

        panels.clear();
        app?.close();
        app = null;
        wss.close(() => {
          resolve();
        });
      });
    },
  };
}
