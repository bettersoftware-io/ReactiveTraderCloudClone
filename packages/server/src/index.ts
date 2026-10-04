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

import { createAccountService } from "./accounts/AccountService.js";
import { createAccountStatusCache } from "./accounts/accountStatusCache.js";
import {
  createAccountDirectory,
  isRegistrationOpen,
  resolveAccountsMode,
} from "./accounts/resolveAccountsMode.js";
import { AnthropicAgentLoop } from "./agent/AnthropicAgentLoop.js";
import type { AgentLoop } from "./agent/agentLoop.js";
import { createJarvisLoops } from "./agent/agentLoop.js";
import { AuthService, parseAuthUsers } from "./auth/AuthService.js";
import { createBanList } from "./auth/banList.js";
import { createRateLimiter } from "./auth/rateLimit.js";
import {
  ACCOUNT_DIRECTORY_TIMEOUT_MS,
  ACCOUNT_MAX_BODY_BYTES,
  ACCOUNT_STATUS_CACHE_MAX_ENTRIES,
  ACCOUNT_STATUS_CACHE_TTL_MS,
  ACCOUNTS_HEALTH_CACHE_MS,
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
  MAX_REGISTRATIONS_PER_DAY,
  MCP_MAX_BODY_BYTES,
  WS_MAX_PAYLOAD_BYTES,
} from "./config/limits.js";
import { buildEffects } from "./effects/index.js";
import {
  type AccountHandlerDeps,
  confirmEmailAddress,
  registerAccount,
  requestPasswordReset,
  resendConfirmationCode,
  resetAccountPassword,
} from "./http/accountHandlers.js";
import {
  createAccountLimits,
  createCodeEntryLimiter,
  createSendFuse,
  createSendLimiter,
} from "./http/accountLimits.js";
import { createAccountsHealth } from "./http/accountsHealth.js";
import { resolveClientIp, resolveTrustedIpHeader } from "./http/clientIp.js";
import {
  authenticateLoginRequest,
  type UpgradeRejection,
} from "./http/loginHandler.js";
import { createPostRouter, type PostRoute } from "./http/postRouter.js";
import { declaredLengthExceeds } from "./http/readBody.js";
import { settleUpgrade } from "./http/settleUpgrade.js";
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

// ── Accounts (B2) ───────────────────────────────────────────────

// Throws on a half-configured or ambiguous environment, on an empty
// AUTH_SECRET in either account mode, and on the dev directory being asked
// for on a deployed machine — all before the server listens.
const accountsMode = resolveAccountsMode(process.env);
// ONE directory instance: the service, the upgrade's status cache and the
// health probe all read the same store.
const accountDirectory = createAccountDirectory(accountsMode, {
  now: readClock,
  timeoutMs: ACCOUNT_DIRECTORY_TIMEOUT_MS,
});

const accounts = createAccountService({
  directory: accountDirectory,
  now: readClock,
  registrationOpen: isRegistrationOpen(process.env),
  maxRegistrationsPerDay: MAX_REGISTRATIONS_PER_DAY,
  codeEntryLimiter: createCodeEntryLimiter(),
  sendLimiter: createSendLimiter(),
  sendFuse: createSendFuse(),
});

const accountStatus = createAccountStatusCache({
  directory: accountDirectory,
  ttlMs: ACCOUNT_STATUS_CACHE_TTL_MS,
  maxEntries: ACCOUNT_STATUS_CACHE_MAX_ENTRIES,
  now: readClock,
});

const accountsHealth = createAccountsHealth({
  directory: accountDirectory,
  cacheMs: ACCOUNTS_HEALTH_CACHE_MS,
  now: readClock,
});

// Each endpoint owns its limiter (`createAccountLimits`); the one shared
// instance is the per-ADDRESS code-entry budget inside the account service,
// which confirm and reset spend together by design.
const accountDeps: AccountHandlerDeps = {
  accounts,
  banList,
  limits: createAccountLimits(),
  now: readClock,
};

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

// ── POST routes ─────────────────────────────────────────────────

const POST_ROUTES: ReadonlyMap<string, PostRoute> = new Map<string, PostRoute>([
  [
    "/login",
    {
      maxBodyBytes: LOGIN_MAX_BODY_BYTES,
      handle: (bodyText: string, ip: string) => {
        return authenticateLoginRequest(bodyText, ip, {
          auth,
          accounts,
          rateLimit: loginRateLimit,
          banList,
          now: readClock,
        });
      },
    },
  ],
  [
    "/register",
    {
      maxBodyBytes: ACCOUNT_MAX_BODY_BYTES,
      handle: (bodyText: string, ip: string) => {
        return registerAccount(bodyText, ip, accountDeps);
      },
    },
  ],
  [
    "/resend-code",
    {
      maxBodyBytes: ACCOUNT_MAX_BODY_BYTES,
      handle: (bodyText: string, ip: string) => {
        return resendConfirmationCode(bodyText, ip, accountDeps);
      },
    },
  ],
  [
    "/confirm-email",
    {
      maxBodyBytes: ACCOUNT_MAX_BODY_BYTES,
      handle: (bodyText: string, ip: string) => {
        return confirmEmailAddress(bodyText, ip, accountDeps);
      },
    },
  ],
  [
    "/request-reset",
    {
      maxBodyBytes: ACCOUNT_MAX_BODY_BYTES,
      handle: (bodyText: string, ip: string) => {
        return requestPasswordReset(bodyText, ip, accountDeps);
      },
    },
  ],
  [
    "/reset-password",
    {
      maxBodyBytes: ACCOUNT_MAX_BODY_BYTES,
      handle: (bodyText: string, ip: string) => {
        return resetAccountPassword(bodyText, ip, accountDeps);
      },
    },
  ],
]);

// Preflight, the ban check before the body, the S2 body cap and the error
// mapping — once, for every route above; the IP is always `clientIp`'s (S3).
const servePostRoute = createPostRouter({
  routes: POST_ROUTES,
  banList,
  clientIp,
  now: readClock,
  log: (line: string): void => {
    console.log(line);
  },
});

// ── HTTP Server ─────────────────────────────────────────────────

// The WebSocket transport is the app's real-time data path. HTTP carries
// /health (Fly probe, token-free GET), /health/accounts (the account store's
// reachability as one word, token-free GET), the six POST routes — /login
// (exchanges credentials for the session token that gates the WS upgrade)
// and the five account routes — and /mcp. All are permissively CORS'd; the
// POST routes answer their OPTIONS preflight.
const httpServer = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url === "/health" && req.method === "GET") {
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url === "/health/accounts" && req.method === "GET") {
    // One of four words — never a URL, a key, an error or a count. `read`
    // never rejects; the catch is the last line of defence.
    accountsHealth
      .read()
      .then((directory) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, directory }));
      })
      .catch(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, directory: "down" }));
      });
    return;
  }

  if (servePostRoute(req, res)) {
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
  accountStatus,
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
  // /login stay reachable (HTTP routes, not WS upgrades). A registered
  // account's token is then re-checked against the account's current status
  // (403, or 503 when the account store does not answer). A rejection is
  // logged by reason — never the token itself.
  verifyClient: (
    info: Parameters<VerifyClientCallbackAsync>[0],
    done: Parameters<VerifyClientCallbackAsync>[1],
  ): void => {
    // Settles the handshake exactly once; never leaves a rejection unhandled.
    void settleUpgrade(
      decideUpgrade(info.req.url, clientIp(info.req), gateDeps),
      done,
      {
        recordRejectedUpgrade: (reason: UpgradeRejection): void => {
          connectionLog.recordRejectedUpgrade(reason);
        },
        log: (line: string): void => {
          console.log(line);
        },
      },
    );
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
  console.log(
    "  HTTP:  /register /resend-code /confirm-email /request-reset /reset-password",
  );
  console.log(`  HTTP:  http://${HOSTNAME}:${PORT}/health/accounts`);
  console.log(`  Accounts: ${accountDirectory.kind}`);
  console.log(`  MCP:   http://${HOSTNAME}:${PORT}/mcp (Streamable HTTP)`);
  console.log(`  WS:    ws://${HOSTNAME}:${PORT}`);
  console.log(`  IP:    trusting header ${TRUSTED_IP_HEADER}`);
});
