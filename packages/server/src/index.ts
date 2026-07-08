import { createServer } from "node:http";

import type { VerifyClientCallbackSync } from "ws";
import { WebSocketServer } from "ws";

import { combineEffects, createWsListener } from "@rtc/ws-effects";

import { isAuthorizedUpgrade } from "./auth.js";
import { allEffects } from "./effects/index.js";
import { createServices } from "./services/serviceContainer.js";
import { toSocket } from "./socket/toSocket.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOSTNAME: string = process.env.HOSTNAME ?? "0.0.0.0";
const WS_ACCESS_TOKEN: string | undefined = process.env.WS_ACCESS_TOKEN;

const services = createServices();
const listen = createWsListener(combineEffects(...allEffects), services);

// ── HTTP Server ─────────────────────────────────────────────────

// The WebSocket transport is the sole app data path (throughput included, via
// the admin.* RPC). The only remaining HTTP endpoint is the /health probe — a
// simple cross-origin GET, so a permissive ACAO is all the CORS it needs.
const httpServer = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end();
});

// ── WebSocket Server ────────────────────────────────────────────

const wss = new WebSocketServer({
  server: httpServer,
  // Reject unauthorized upgrades with 401 before a socket exists, so
  // listen() only ever runs for authorized clients. /health stays
  // token-free (it is an HTTP route, not a WS upgrade) for Fly health checks.
  verifyClient: (info: Parameters<VerifyClientCallbackSync>[0]): boolean => {
    return isAuthorizedUpgrade(info.req.url, WS_ACCESS_TOKEN);
  },
});

wss.on("connection", (ws) => {
  listen(toSocket(ws));
});

// ── Start ───────────────────────────────────────────────────────

httpServer.listen(PORT, HOSTNAME, () => {
  console.log(`Server listening on ${HOSTNAME}:${PORT}`);
  console.log(`  HTTP:  http://${HOSTNAME}:${PORT}/health`);
  console.log(`  WS:    ws://${HOSTNAME}:${PORT}`);
});
