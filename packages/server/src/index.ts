import { createServer } from "node:http";

import { WebSocketServer } from "ws";

import { createServices } from "./services/serviceContainer.js";
import { handleConnection } from "./ws/wsHandler.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOSTNAME = process.env.HOSTNAME ?? "0.0.0.0";

const services = createServices();

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

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  handleConnection(ws, services);
});

// ── Start ───────────────────────────────────────────────────────

httpServer.listen(PORT, HOSTNAME, () => {
  console.log(`Server listening on ${HOSTNAME}:${PORT}`);
  console.log(`  HTTP:  http://${HOSTNAME}:${PORT}/health`);
  console.log(`  WS:    ws://${HOSTNAME}:${PORT}`);
});
