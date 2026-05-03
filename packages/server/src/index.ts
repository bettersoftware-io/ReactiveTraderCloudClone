import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { createServices } from "./services/serviceContainer.js";
import { handleConnection } from "./ws/wsHandler.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOSTNAME = process.env.HOSTNAME ?? "0.0.0.0";

const services = createServices();

// ── HTTP Server ─────────────────────────────────────────────────

const httpServer = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url === "/throughput" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ value: services.throughput.getThroughput() }));
    return;
  }

  if (req.url === "/throughput" && req.method === "PUT") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const { value } = JSON.parse(body) as { value: number };
        services.throughput.setThroughput(value);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, value }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
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
