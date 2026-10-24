import type { IncomingMessage, ServerResponse } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import type { JarvisToolDefinition } from "@rtc/agent-tools";

import type { AccountDirectory } from "../accounts/AccountDirectory.js";
import type { CachedAccount } from "../accounts/accountStatusCache.js";
import type { RevocationLedger } from "../accounts/revocationLedger.js";
import { hasSessionEnded } from "../accounts/sessionEnd.js";
import type { AuthService } from "../auth/AuthService.js";
import { buildJarvisMcpServer } from "./buildJarvisMcpServer.js";

export interface McpHandlerDeps {
  readonly auth: Pick<AuthService, "verifyToken">;
  readonly tools: readonly JarvisToolDefinition[];
  /** Read directly, never through the status cache: an administrator's
   * demotion or block must bite on the next request. */
  readonly accounts: Pick<AccountDirectory, "findAccount">;
  readonly revocations: RevocationLedger;
}

const BEARER_SCHEME_LENGTH: number = "Bearer ".length;

/** RFC 9110 §11.1: the auth *scheme* name is case-insensitive (`bearer`,
 * `BEARER`, `Bearer` all name the same scheme) — only the token that follows
 * is case-sensitive, so it's sliced from the original (not lower-cased)
 * header. */
function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;

  if (typeof header !== "string") {
    return null;
  }

  const scheme = header.slice(0, BEARER_SCHEME_LENGTH);

  if (scheme.toLowerCase() !== "bearer ") {
    return null;
  }

  return header.slice(BEARER_SCHEME_LENGTH);
}

/** Writes a JSON-RPC-shaped error so MCP clients surface a readable reason
 * instead of a bare status line. Never echoes the presented token. */
function rejectRequest(
  res: ServerResponse,
  status: number,
  message: string,
  headers?: Record<string, string>,
): void {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message },
      id: null,
    }),
  );
}

async function readAdminGate(
  accountId: string,
  issuedAt: number | null,
  deps: McpHandlerDeps,
): Promise<"admitted" | "refused" | "unavailable"> {
  let found: Awaited<ReturnType<McpHandlerDeps["accounts"]["findAccount"]>>;

  try {
    found = await deps.accounts.findAccount(accountId);
  } catch {
    return "unavailable";
  }

  if (found.outcome === "unavailable") {
    return "unavailable";
  }

  const account: CachedAccount =
    found.outcome === "found"
      ? {
          status: found.account.status,
          sessionsNotBefore: found.account.sessionsNotBefore,
        }
      : { status: "missing" };

  const verdict = hasSessionEnded(
    issuedAt,
    account,
    deps.revocations.notBefore(accountId),
  );

  if (verdict === "unavailable") {
    return "unavailable";
  }

  if (
    verdict === "ended" ||
    found.outcome !== "found" ||
    found.account.access !== "admin"
  ) {
    return "refused";
  }

  return "admitted";
}

async function serveMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: McpHandlerDeps,
): Promise<void> {
  const token = bearerToken(req);

  const verified = token === null ? null : deps.auth.verifyToken(token);

  if (verified === null) {
    rejectRequest(
      res,
      401,
      "Unauthorized: pass 'Authorization: Bearer <token>' using a session token from POST /login.",
    );
    return;
  }

  // The administrator only: a roster login has no account, and a registered
  // account must be active, still `admin` today and unrevoked since its token
  // was issued.
  if (verified.accountId === null) {
    rejectRequest(res, 403, "admin_only");
    return;
  }

  // Deny-only use of the signed claim: a token minted for a user is refused
  // before any directory read, so a user's token cannot turn each request
  // into a store round trip. Admission still needs the directory below — the
  // claim alone never admits (a demoted administrator's token still says
  // admin).
  if (verified.access !== "admin") {
    rejectRequest(res, 403, "admin_only");
    return;
  }

  const gate = await readAdminGate(verified.accountId, verified.issuedAt, deps);

  if (gate === "unavailable") {
    rejectRequest(res, 503, "Account store unavailable.");
    return;
  }

  if (gate === "refused") {
    rejectRequest(res, 403, "admin_only");
    return;
  }

  if (req.method !== "POST") {
    rejectRequest(
      res,
      405,
      "Method not allowed: this MCP endpoint is stateless and accepts POST only.",
      { Allow: "POST" },
    );
    return;
  }

  // Stateless mode: a fresh Server + transport pair per request. The pair
  // shares nothing across requests except the tool definitions, so any
  // node can serve any request and there is no session table to leak.
  const server = buildJarvisMcpServer(deps.tools);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res);
}

/** The `/mcp` route: Bearer-authenticated (same `AuthService` tokens as the
 * WS upgrade) and open to the administrator alone, stateless Streamable HTTP over the low-level Jarvis server. */
export function createMcpRequestHandler(
  deps: McpHandlerDeps,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req: IncomingMessage, res: ServerResponse): void => {
    serveMcpRequest(req, res, deps).catch(() => {
      if (!res.headersSent) {
        rejectRequest(res, 500, "Internal error handling the MCP request.");
      } else {
        res.end();
      }
    });
  };
}
