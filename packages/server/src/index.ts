import type { IncomingMessage } from "node:http";
import { createServer } from "node:http";

import type { VerifyClientCallbackAsync } from "ws";
import { WebSocketServer } from "ws";

import {
  buildJarvisTools,
  type ConfirmGate,
  type JarvisToolDefinition,
} from "@rtc/agent-tools";
import { KNOWN_CURRENCY_PAIRS } from "@rtc/domain";
import { combineEffects, createWsListener } from "@rtc/ws-effects";

import { AnthropicAgentLoop } from "./agent/AnthropicAgentLoop.js";
import type { AgentLoop } from "./agent/agentLoop.js";
import { createJarvisLoops } from "./agent/agentLoop.js";
import { AuthService, parseAuthUsers } from "./auth/AuthService.js";
import { createBanList } from "./auth/banList.js";
import { createRateLimiter } from "./auth/rateLimit.js";
import {
  BAN_DURATION_MS,
  BAN_MAX_ENTRIES,
  BAN_STRIKE_WINDOW_MS,
  BAN_STRIKES,
  INBOUND_BURST,
  INBOUND_DROPS_BEFORE_CLOSE,
  INBOUND_REFILL_PER_SECOND,
  LOGIN_MAX_BODY_BYTES,
  LOGIN_RATE_LIMIT_MAX,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  MAX_CONNECTIONS_PER_IP,
  MAX_CONNECTIONS_TOTAL,
  MCP_MAX_BODY_BYTES,
  WS_MAX_PAYLOAD_BYTES,
} from "./config/limits.js";
import { buildEffects } from "./effects/index.js";
import { resolveClientIp, resolveTrustedIpHeader } from "./http/clientIp.js";
import { authenticateLoginRequest } from "./http/loginHandler.js";
import {
  BodyTooLargeError,
  declaredLengthExceeds,
  readBodyWithLimit,
} from "./http/readBody.js";
import { decideUpgrade, type UpgradeGateDeps } from "./http/upgradeGate.js";
import { createMcpRequestHandler } from "./mcp/mcpHttpHandler.js";
import { createConnectionLog } from "./observability/connectionLog.js";
import { scopeServicesToConnection } from "./services/connectionScope.js";
import {
  createServices,
  type ServiceContainer,
} from "./services/serviceContainer.js";
import { createConnectionGuard } from "./socket/connectionGuard.js";
import { createTokenBucket } from "./socket/tokenBucket.js";
import { toSocket } from "./socket/toSocket.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOSTNAME: string = process.env.HOSTNAME ?? "0.0.0.0";
const AUTH_TTL_MS = Number(process.env.AUTH_TTL_MS ?? 8 * 60 * 60 * 1000);
// S3 — every per-caller rule below keys on this header's value.
const TRUSTED_IP_HEADER: string = resolveTrustedIpHeader(process.env);

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
    // render_panel's roster check (LIVE brains only) — the same static
    // roster the desk tools' own reads ultimately source from
    // (`ReferenceDataSimulator.getCurrencyPairs()` is just this constant
    // wrapped in a delayed Observable), taken directly here since tool-list
    // construction is synchronous and this constant never changes at
    // runtime.
    knownSymbols: KNOWN_CURRENCY_PAIRS.map((pair) => {
      return pair.symbol;
    }),
  });
}

const services = createServices();
const jarvisLoops = createJarvisLoops(
  process.env,
  services,
  buildAnthropicLoop,
);

// One merged effect for the process; a listener is built PER CONNECTION
// below so each socket gets its own connection-scoped services (S10).
const effect = combineEffects(...buildEffects(jarvisLoops));

const auth = new AuthService({
  secret: process.env.AUTH_SECRET ?? "",
  ttlMs: AUTH_TTL_MS,
  credentials: parseAuthUsers(process.env.AUTH_USERS),
});

const loginRateLimit = createRateLimiter(
  LOGIN_RATE_LIMIT_MAX,
  LOGIN_RATE_LIMIT_WINDOW_MS,
);

// §9.2 — the in-app expiring ban table, consulted first at both edges.
const banList = createBanList({
  strikesToBan: BAN_STRIKES,
  strikeWindowMs: BAN_STRIKE_WINDOW_MS,
  banMs: BAN_DURATION_MS,
  maxEntries: BAN_MAX_ENTRIES,
  onBan: (ip: string, untilMs: number, reason: string): void => {
    console.log(
      `[auth] ${new Date().toISOString()} ban ip=${ip} reason=${reason} until=${new Date(untilMs).toISOString()}`,
    );
  },
});

// S8 — live-socket caps, checked before the handshake and counted over the
// socket's real lifetime (connection → close).
const connections = createConnectionGuard({
  maxTotal: MAX_CONNECTIONS_TOTAL,
  maxPerIp: MAX_CONNECTIONS_PER_IP,
});

function readClock(): number {
  return Date.now();
}

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
  return resolveClientIp(req, TRUSTED_IP_HEADER);
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
    // S2 — the body is capped by bytes received before it is parsed.
    readBodyWithLimit(req, LOGIN_MAX_BODY_BYTES)
      .then((bodyText) => {
        return authenticateLoginRequest(bodyText, clientIp(req), {
          auth,
          rateLimit: loginRateLimit,
          banList,
          now: readClock,
        });
      })
      .then((result) => {
        res.writeHead(result.status, result.headers);
        res.end(result.body);
      })
      .catch((err: unknown) => {
        const status = err instanceof BodyTooLargeError ? 413 : 400;
        const error =
          err instanceof BodyTooLargeError
            ? "body_too_large"
            : "malformed_request";
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error }));
      });
    return;
  }

  if (req.url === "/mcp" || req.url?.startsWith("/mcp?") === true) {
    // The MCP transport reads its own body; refuse an over-declared one early.
    if (declaredLengthExceeds(req.headers, MCP_MAX_BODY_BYTES)) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "body_too_large" }));
      return;
    }

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

const gateDeps: UpgradeGateDeps = {
  auth,
  banList,
  connections,
  now: readClock,
};

const wss = new WebSocketServer({
  server: httpServer,
  // S1 — `ws`'s default is 100 MiB, far more than the 256 MB VM. An
  // oversized frame closes THAT socket with 1009 and surfaces as an `error`
  // event on it (handled below, never thrown).
  maxPayload: WS_MAX_PAYLOAD_BYTES,
  // Reject an upgrade before a socket exists, cheapest check first: a banned
  // IP (429), a capped IP or a full process (503), then the token (401 — a
  // caller that never signed in, or an expired/bad token). /health and
  // /login stay reachable (HTTP routes, not WS upgrades). A rejection is
  // logged by reason — never the token itself.
  verifyClient: (
    info: Parameters<VerifyClientCallbackAsync>[0],
    done: Parameters<VerifyClientCallbackAsync>[1],
  ): void => {
    const verdict = decideUpgrade(info.req.url, clientIp(info.req), gateDeps);

    if (!verdict.ok && verdict.reason) {
      connectionLog.recordRejectedUpgrade(verdict.reason);
    }

    done(verdict.ok, verdict.status, verdict.ok ? undefined : verdict.reason);
  },
});

interface CodedError {
  readonly code?: string;
}

wss.on("connection", (ws, req) => {
  const ip = clientIp(req);
  connections.acquire(ip);
  connectionLog.recordConnect();
  // S14 — without this listener a single malformed frame is an unhandled
  // `error` event, which Node turns into a process crash. An oversized frame
  // (S1) is also a ban strike.
  ws.on("error", (err: Error & CodedError) => {
    connectionLog.recordSocketError(err.code ?? err.name);

    if (err.code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH") {
      banList.strike(ip, "frame-too-large", readClock());
    }
  });
  ws.on("close", () => {
    connections.release(ip);
    connectionLog.recordDisconnect();
  });
  // S8 — a per-socket token bucket in front of the effects; S10 — a
  // connection-scoped service container (its own ThroughputService).
  createWsListener(
    effect,
    scopeServicesToConnection(services),
  )(
    toSocket(ws, {
      bucket: createTokenBucket(INBOUND_BURST, INBOUND_REFILL_PER_SECOND),
      dropsBeforeClose: INBOUND_DROPS_BEFORE_CLOSE,
      now: readClock,
      onFlood: (): void => {
        banList.strike(ip, "message-flood", readClock());
      },
    }),
  );
});

// ── Start ───────────────────────────────────────────────────────

httpServer.listen(PORT, HOSTNAME, () => {
  console.log(`Server listening on ${HOSTNAME}:${PORT}`);
  console.log(`  HTTP:  http://${HOSTNAME}:${PORT}/health`);
  console.log(`  HTTP:  http://${HOSTNAME}:${PORT}/login`);
  console.log(`  MCP:   http://${HOSTNAME}:${PORT}/mcp (Streamable HTTP)`);
  console.log(`  WS:    ws://${HOSTNAME}:${PORT}`);
  console.log(`  IP:    trusting header ${TRUSTED_IP_HEADER}`);
});
