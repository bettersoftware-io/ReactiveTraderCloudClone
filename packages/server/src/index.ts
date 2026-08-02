import type { IncomingMessage } from "node:http";
import { createServer } from "node:http";

import type { VerifyClientCallbackSync } from "ws";
import { WebSocketServer } from "ws";

import {
  buildJarvisTools,
  type ConfirmGate,
  type JarvisToolDefinition,
} from "@rtc/agent-tools";
import { combineEffects, createWsListener } from "@rtc/ws-effects";

import { AnthropicAgentLoop } from "./agent/AnthropicAgentLoop.js";
import type { AgentLoop } from "./agent/agentLoop.js";
import { createJarvisLoops } from "./agent/agentLoop.js";
import { AuthService, parseAuthUsers } from "./auth/AuthService.js";
import { createRateLimiter } from "./auth/rateLimit.js";
import { buildEffects } from "./effects/index.js";
import {
  authenticateLoginRequest,
  describeUpgrade,
} from "./http/loginHandler.js";
import { createMcpRequestHandler } from "./mcp/mcpHttpHandler.js";
import { createConnectionLog } from "./observability/connectionLog.js";
import {
  createServices,
  type ServiceContainer,
} from "./services/serviceContainer.js";
import { toSocket } from "./socket/toSocket.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOSTNAME: string = process.env.HOSTNAME ?? "0.0.0.0";
const AUTH_TTL_MS = Number(process.env.AUTH_TTL_MS ?? 8 * 60 * 60 * 1000);
const LOGIN_RATE_LIMIT_MAX = 10;
const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000;

function buildJarvisToolsFor(
  services: ServiceContainer,
  confirmTrade: ConfirmGate,
): readonly JarvisToolDefinition[] {
  return buildJarvisTools({
    referenceData: services.referenceData,
    pricing: services.pricing,
    blotter: services.blotter,
    analytics: services.analytics,
    execution: services.execution,
    serviceHealth: services.serviceHealth,
    confirmTrade,
  });
}

/** The seam `createJarvisLoops` warns and falls through without: builds the
 * real `AnthropicAgentLoop`, wiring each session's own `buildJarvisTools`
 * call (see `AnthropicAgentLoopOptions.buildTools`'s doc comment for why that
 * must happen per session, not once here) and `services.usageMeter` so every
 * real Claude turn's token usage reaches the admin usage dock.
 * `createJarvisLoops` only invokes this when `env.ANTHROPIC_API_KEY` is
 * already known truthy, hence the `?? ""` fallback below is unreachable in
 * practice, not a silent-empty-key path. Satisfies `AnthropicLoopBuilder`
 * structurally — no explicit annotation needed on a function declaration. */
function buildAnthropicLoop(
  env: NodeJS.ProcessEnv,
  services: ServiceContainer,
): AgentLoop {
  return new AnthropicAgentLoop({
    apiKey: env.ANTHROPIC_API_KEY ?? "",
    buildTools: (confirmTrade: ConfirmGate) => {
      return buildJarvisToolsFor(services, confirmTrade);
    },
    usageMeter: services.usageMeter,
  });
}

const services = createServices();
const jarvisLoops = createJarvisLoops(
  process.env,
  services,
  buildAnthropicLoop,
);

const listen = createWsListener(
  combineEffects(...buildEffects(jarvisLoops)),
  services,
);

const auth = new AuthService({
  secret: process.env.AUTH_SECRET ?? "",
  ttlMs: AUTH_TTL_MS,
  credentials: parseAuthUsers(process.env.AUTH_USERS),
});

const loginRateLimit = createRateLimiter(
  LOGIN_RATE_LIMIT_MAX,
  LOGIN_RATE_LIMIT_WINDOW_MS,
);

// ── MCP endpoint ────────────────────────────────────────────────

/** MCP-side HITL is the external client's job (Claude Desktop/Code ask
 * before every write tool), so our layer approves without prompting —
 * parent spec §3.4's "ungated at our layer" decision. Satisfies `ConfirmGate`
 * structurally — no explicit annotation needed on a function declaration. */
function approveWithoutPrompt(): Promise<boolean> {
  return Promise.resolve(true);
}

const serveMcp = createMcpRequestHandler({
  auth,
  tools: buildJarvisToolsFor(services, approveWithoutPrompt),
});

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
        const result = authenticateLoginRequest(bodyText, clientIp(req), {
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

  if (req.url === "/mcp" || req.url?.startsWith("/mcp?") === true) {
    serveMcp(req, res);
    return;
  }

  res.writeHead(404);
  res.end();
});

// ── WebSocket Server ────────────────────────────────────────────

// Connection observability — one structured stdout line per WS accept /
// disconnect / rejected upgrade, visible live via `fly logs -a rtc-clone-server`.
const connectionLog = createConnectionLog();

const wss = new WebSocketServer({
  server: httpServer,
  // Reject unauthorized upgrades with 401 before a socket exists, so
  // listen() only ever runs for authorized clients. /health and /login
  // stay reachable (they are HTTP routes, not WS upgrades). A rejection is
  // logged by reason (no-token = never signed in; invalid-token = expired/bad)
  // — never the token itself.
  verifyClient: (info: Parameters<VerifyClientCallbackSync>[0]): boolean => {
    const decision = describeUpgrade(info.req.url, auth);

    if (!decision.ok && decision.reason) {
      connectionLog.recordRejectedUpgrade(decision.reason);
    }

    return decision.ok;
  },
});

wss.on("connection", (ws) => {
  connectionLog.recordConnect();
  ws.on("close", () => {
    connectionLog.recordDisconnect();
  });
  listen(toSocket(ws));
});

// ── Start ───────────────────────────────────────────────────────

httpServer.listen(PORT, HOSTNAME, () => {
  console.log(`Server listening on ${HOSTNAME}:${PORT}`);
  console.log(`  HTTP:  http://${HOSTNAME}:${PORT}/health`);
  console.log(`  HTTP:  http://${HOSTNAME}:${PORT}/login`);
  console.log(`  MCP:   http://${HOSTNAME}:${PORT}/mcp (Streamable HTTP)`);
  console.log(`  WS:    ws://${HOSTNAME}:${PORT}`);
});
