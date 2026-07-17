import type { IncomingMessage } from "node:http";
import { createServer } from "node:http";

import type { VerifyClientCallbackSync } from "ws";
import { WebSocketServer } from "ws";

import { combineEffects, createWsListener } from "@rtc/ws-effects";

import { AuthService, parseAuthUsers } from "./auth/AuthService.js";
import { createRateLimiter } from "./auth/rateLimit.js";
import { allEffects } from "./effects/index.js";
import { authorizeUpgrade, handleLogin } from "./http/loginHandler.js";
import { createServices } from "./services/serviceContainer.js";
import { toSocket } from "./socket/toSocket.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOSTNAME: string = process.env.HOSTNAME ?? "0.0.0.0";
const AUTH_TTL_MS = Number(process.env.AUTH_TTL_MS ?? 8 * 60 * 60 * 1000);
const LOGIN_RATE_LIMIT_MAX = 10;
const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000;

const services = createServices();
const listen = createWsListener(combineEffects(...allEffects), services);

const auth = new AuthService({
  secret: process.env.AUTH_SECRET ?? "",
  ttlMs: AUTH_TTL_MS,
  credentials: parseAuthUsers(process.env.AUTH_USERS),
});
const loginRateLimit = createRateLimiter(
  LOGIN_RATE_LIMIT_MAX,
  LOGIN_RATE_LIMIT_WINDOW_MS,
);

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const firstHop = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(",")[0];
  return firstHop?.trim() ?? req.socket.remoteAddress ?? "unknown";
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

// ── HTTP Server ─────────────────────────────────────────────────

// The WebSocket transport is the app's real-time data path. HTTP carries
// two routes: /health (Fly probe, token-free GET) and /login (rate-limited
// POST that exchanges credentials for a session token used to gate the WS
// upgrade). Both are permissively CORS'd — /login additionally answers its
// OPTIONS preflight.
const httpServer = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url === "/health" && req.method === "GET") {
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url === "/login" && req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/login" && req.method === "POST") {
    readBody(req)
      .then((bodyText) => {
        const result = handleLogin(bodyText, clientIp(req), {
          auth,
          rateLimit: loginRateLimit,
          now: (): number => {
            return Date.now();
          },
        });
        res.writeHead(result.status, result.headers);
        res.end(result.body);
      })
      .catch(() => {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "malformed_request" }));
      });
    return;
  }

  res.writeHead(404);
  res.end();
});

// ── WebSocket Server ────────────────────────────────────────────

const wss = new WebSocketServer({
  server: httpServer,
  // Reject unauthorized upgrades with 401 before a socket exists, so
  // listen() only ever runs for authorized clients. /health and /login
  // stay reachable (they are HTTP routes, not WS upgrades).
  verifyClient: (info: Parameters<VerifyClientCallbackSync>[0]): boolean => {
    return authorizeUpgrade(info.req.url, auth);
  },
});

wss.on("connection", (ws) => {
  listen(toSocket(ws));
});

// ── Start ───────────────────────────────────────────────────────

httpServer.listen(PORT, HOSTNAME, () => {
  console.log(`Server listening on ${HOSTNAME}:${PORT}`);
  console.log(`  HTTP:  http://${HOSTNAME}:${PORT}/health`);
  console.log(`  HTTP:  http://${HOSTNAME}:${PORT}/login`);
  console.log(`  WS:    ws://${HOSTNAME}:${PORT}`);
});
