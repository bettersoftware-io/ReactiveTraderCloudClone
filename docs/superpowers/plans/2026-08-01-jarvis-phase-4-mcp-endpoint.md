# Jarvis Phase 4 — MCP Streamable-HTTP Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the seven `@rtc/agent-tools` desk tools as an MCP server over Streamable HTTP at `/mcp` on the existing `@rtc/server` HTTP server, so external MCP clients (Claude Desktop, Claude Code) drive the *same live desk* the app streams from — a trade executed from Claude Code appears in the running app's blotter.

**Architecture:** Parent spec §3.4 ([2026-07-12-jarvis-ai-assistant-design.md](../specs/2026-07-12-jarvis-ai-assistant-design.md)). A new `packages/server/src/mcp/` module: `buildJarvisMcpServer` adapts the SDK-free `JarvisToolDefinition[]` registry to the MCP SDK's **low-level `Server`** (raw JSON Schema passes through verbatim — no Zod anywhere), and `createMcpRequestHandler` mounts it on `node:http` behind a Bearer-token check against the existing `AuthService`. **Stateless** Streamable HTTP (`sessionIdGenerator: undefined`, fresh `Server` + transport per POST): the server is tools-only — no notifications, no resumability — so session state would be dead weight, and stateless per-request instances share nothing but the (stateless) tool definitions.

**Tech Stack:** `@modelcontextprotocol/sdk` **^1.30.0** (freshness verified 2026-08-01: 1.30.0 published 2026-07-27, outside the 24h `minimumReleaseAge` cooldown), `node:http`, existing `AuthService`, existing `@rtc/agent-tools`.

## Global Constraints

- **`@rtc/domain` stays byte-identical.** No file under `packages/domain/` may change.
- **No network calls in any CI-run test.** MCP tests use the SDK's `InMemoryTransport` or a local ephemeral-port (`listen(0)`) `node:http` server — never a remote host, never the Anthropic API.
- **MCP SDK is server-only.** `@modelcontextprotocol/sdk` is a runtime dep of `@rtc/server` alone, confined by a dep-cruiser **allowlist** rule (`no-mcp-sdk-outside-server`, Task 1) mirroring `no-anthropic-sdk-in-inner-packages` — every package except `packages/server/` is forbidden, not just today's known offenders.
- **No Zod.** `@rtc/agent-tools` stores raw JSON Schema by design; the adapter uses the SDK's low-level `Server` + `setRequestHandler(ListToolsRequestSchema | CallToolRequestSchema)` so schemas pass through verbatim. The high-level `McpServer`/`registerTool` API (Zod-first) is not used.
- **`execute_trade` is UNGATED at our layer for MCP** (parent §3.4): external MCP clients enforce human-in-the-loop through their own tool-approval surface (Claude Desktop/Code always ask before a write tool). The injected gate is a named `approveWithoutPrompt` constant — never an anonymous `() => true` inline.
- **Auth:** `Authorization: Bearer <session token>` verified by the existing `AuthService.verifyToken` — the same scrypt/HMAC token `/login` issues and the WS upgrade checks via `?access=`. Missing/invalid → HTTP 401 with a JSON-RPC error body. **Deviation from parent §3.4 recorded:** the spec (written pre-auth-overhaul) said "same shared-token header check … enabled by the same env gate"; today's honest mapping is the `AuthService` session token, and the endpoint mounts **unconditionally** (not behind the `ANTHROPIC_API_KEY`/`RTC_JARVIS_FAKE` availability gate) because MCP needs no Anthropic key — the external client brings its own model. Auth is still always required.
- **Seven tools, not eight.** `get_app_context` stays deferred (P3 logged decision (a)); the MCP surface is exactly `buildJarvisTools`'s seven.
- **ESM specifiers:** every relative import inside `packages/server` ends in `.js` (nodenext + the `.js-import-extensions` lint rule).
- **Handler naming:** concrete functions are named for their **effect** (`rtc/name-functions-by-effect`); `docs/handler-naming.md` governs. Slots (`confirmTrade`) stay `onX`-style-free but the concrete gate gets an effect name.
- **Gates:** after each task, `pnpm --filter @rtc/server test` (plus the task's own listed checks) must pass; the full fast-tier gauntlet runs before the PR.

## File Structure

```
packages/server/
  package.json                          # + "@modelcontextprotocol/sdk": "^1.30.0"
  src/mcp/
    buildJarvisMcpServer.ts             # registry → low-level MCP Server (list + call)
    buildJarvisMcpServer.test.ts        # InMemoryTransport + SDK Client
    mcpHttpHandler.ts                   # bearer auth + stateless Streamable HTTP mount
    mcpHttpHandler.test.ts              # real node:http on port 0 + StreamableHTTPClientTransport
  src/index.ts                          # route /mcp before the 404 fallthrough
.dependency-cruiser.cjs                 # + no-mcp-sdk-outside-server allowlist rule
docs/architecture/18-jarvis-ai-agent-surface.md   # §18.14 receipt
docs/STATUS.md                          # Jarvis entry: P4 shipped → next P5
CLAUDE.md                               # server package line: mention /mcp + SDK confinement
```

---

### Task 1: SDK dependency + dep-cruiser confinement rule

**Files:**
- Modify: `packages/server/package.json` (dependencies)
- Modify: `.dependency-cruiser.cjs` (after the `no-anthropic-sdk-in-inner-packages` rule)

**Interfaces:**
- Produces: `@modelcontextprotocol/sdk@^1.30.0` importable from `packages/server` only.

- [ ] **Step 1: Add the dependency**

In `packages/server/package.json`, add to `dependencies` (alphabetical position):

```json
"@modelcontextprotocol/sdk": "^1.30.0",
```

Run: `pnpm install --no-frozen-lockfile` (from the repo root). Expected: resolves 1.30.0 or later; lockfile updated.

- [ ] **Step 2: Add the confinement rule**

In `.dependency-cruiser.cjs`, directly after the `no-anthropic-sdk-in-inner-packages` rule object, add:

```js
{
  name: "no-mcp-sdk-outside-server",
  severity: "error",
  comment:
    "@modelcontextprotocol/sdk is a server-only dependency (Jarvis phase 4) — the MCP endpoint lives in packages/server/src/mcp/ and every OTHER package stays free of the SDK, exactly like no-anthropic-sdk-in-inner-packages above: an allowlist over the single permitted importer, not a blocklist of packages that happened to matter when this was written. @rtc/agent-tools in particular must stay SDK-free — its whole design point is that the registry is transport-neutral raw JSON Schema.",
  from: { path: "^packages/", pathNot: "^packages/server/" },
  to: { path: "node_modules/@modelcontextprotocol/" },
},
```

- [ ] **Step 3: Verify the gates see it**

Run: `pnpm check:deps` — expected PASS (rule loads, no violations).
Run: `pnpm check:versions` — expected PASS (single-range policy; the dep exists in exactly one package).
Run: `pnpm --filter @rtc/server test` — expected PASS (nothing imports it yet).

- [ ] **Step 4: Commit**

```bash
git add packages/server/package.json pnpm-lock.yaml .dependency-cruiser.cjs
git commit -m "feat(server): add @modelcontextprotocol/sdk confined to the server package"
```

---

### Task 2: `buildJarvisMcpServer` — registry → MCP Server adapter

**Files:**
- Create: `packages/server/src/mcp/buildJarvisMcpServer.ts`
- Test: `packages/server/src/mcp/buildJarvisMcpServer.test.ts`

**Interfaces:**
- Consumes: `JarvisToolDefinition` from `@rtc/agent-tools` (`{name, description, inputSchema: Record<string, unknown>, run(input: unknown): Promise<string>}`).
- Produces: `buildJarvisMcpServer(tools: readonly JarvisToolDefinition[]): Server` — a fresh low-level MCP `Server` per call (stateless mode requires one per request). Also exports `JARVIS_MCP_SERVER_NAME = "rtc-desk"` and `JARVIS_MCP_SERVER_VERSION = "1.0.0"`.

- [ ] **Step 1: Write the failing tests**

`packages/server/src/mcp/buildJarvisMcpServer.test.ts`:

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildJarvisTools, type ConfirmGate } from "@rtc/agent-tools";

import { createServices } from "../services/serviceContainer.js";
import { buildJarvisMcpServer } from "./buildJarvisMcpServer.js";

/** MCP-side HITL is the external client's job (parent spec §3.4) — this gate
 * approves every trade so the tool executes when the client has already
 * asked its own user. */
const approveWithoutPrompt: ConfirmGate = () => {
  return Promise.resolve(true);
};

async function connectClient(tools: ReturnType<typeof buildJarvisTools>) {
  const server = buildJarvisMcpServer(tools);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "vitest", version: "0.0.0" });
  await client.connect(clientTransport);
  return { client, server };
}

describe("buildJarvisMcpServer", () => {
  beforeEach(() => {
    // ExecutionSimulator fills after Math.random() * 2000 ms; pin to zero so
    // the execute_trade round-trip is instant under real timers (fake timers
    // would stall the transport's internal promises).
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists exactly the seven desk tools with their JSON Schemas verbatim", async () => {
    const tools = buildJarvisTools({
      ...createServices(),
      confirmTrade: approveWithoutPrompt,
    });
    const { client } = await connectClient(tools);

    const listed = await client.listTools();

    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
      "execute_trade",
      "get_analytics",
      "get_blotter",
      "get_price",
      "get_price_history",
      "get_service_health",
      "list_currency_pairs",
    ]);
    const getPrice = listed.tools.find((tool) => tool.name === "get_price");
    const source = tools.find((tool) => tool.name === "get_price");
    expect(getPrice?.inputSchema).toEqual(source?.inputSchema);
    expect(getPrice?.description).toBe(source?.description);
  });

  it("dispatches tools/call to the tool's run and returns its string as text content", async () => {
    const tools = buildJarvisTools({
      ...createServices(),
      confirmTrade: approveWithoutPrompt,
    });
    const { client } = await connectClient(tools);

    const result = await client.callTool({
      name: "list_currency_pairs",
      arguments: {},
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.type).toBe("text");
    expect(content[0]?.text).toContain("EURUSD");
    expect(result.isError).toBeFalsy();
  });

  it("an unknown tool name is a JSON-RPC error, not a tool result", async () => {
    const tools = buildJarvisTools({
      ...createServices(),
      confirmTrade: approveWithoutPrompt,
    });
    const { client } = await connectClient(tools);

    await expect(
      client.callTool({ name: "drop_all_tables", arguments: {} }),
    ).rejects.toThrow(/drop_all_tables/);
  });

  it("a tool run that rejects becomes isError content, never a transport failure", async () => {
    const explodingTool = {
      name: "explode",
      description: "always throws",
      inputSchema: { type: "object", additionalProperties: false },
      run: (): Promise<string> => {
        return Promise.reject(new Error("boom"));
      },
    };
    const { client } = await connectClient([explodingTool]);

    const result = await client.callTool({ name: "explode", arguments: {} });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toContain("boom");
  });

  it("execute_trade through MCP lands the trade on the SAME services' blotter (same-process proof)", async () => {
    const services = createServices();
    const tools = buildJarvisTools({
      ...services,
      confirmTrade: approveWithoutPrompt,
    });
    const { client } = await connectClient(tools);

    const result = await client.callTool({
      name: "execute_trade",
      arguments: { symbol: "EURUSD", direction: "Buy", notional: 1_000_000 },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "{}") as {
      status: string;
      tradeId: number;
    };
    expect(parsed.status).toBe("Done");

    const blotterResult = await client.callTool({
      name: "get_blotter",
      arguments: {},
    });
    const blotterContent = blotterResult.content as Array<{ text: string }>;
    const blotter = JSON.parse(blotterContent[0]?.text ?? "{}") as {
      trades: Array<{ tradeId: number }>;
    };
    expect(
      blotter.trades.some((trade) => {
        return trade.tradeId === parsed.tradeId;
      }),
    ).toBe(true);
  }, 15_000);
});
```

**Adaptation notes for the implementer (verify against the real code, do not guess):**
- `createServices()` returns the `ServiceContainer`; confirm its fields spread cleanly into `JarvisToolDeps` (see `buildJarvisToolsFor` in `packages/server/src/index.ts` for the exact field mapping — if the container has extra fields, spread works; if names differ, map explicitly as that function does).
- `execute_trade`'s argument vocabulary (`direction` enum values, notional field name) must match the tool's inputSchema — copy from `packages/agent-tools/src/buildJarvisTools.test.ts` (`Direction.Buy` serializes as the schema's enum string; check whether the wire value is `"Buy"` or `"buy"`).
- The reference-data lookup inside `execute_trade` may add a fixed simulated delay (~1s in agent-tools tests); the 15s test timeout absorbs it under real timers.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rtc/server exec vitest run src/mcp/buildJarvisMcpServer.test.ts`
Expected: FAIL — cannot resolve `./buildJarvisMcpServer.js`.

- [ ] **Step 3: Implement**

`packages/server/src/mcp/buildJarvisMcpServer.ts`:

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import type { JarvisToolDefinition } from "@rtc/agent-tools";

export const JARVIS_MCP_SERVER_NAME = "rtc-desk";
export const JARVIS_MCP_SERVER_VERSION = "1.0.0";

/** Reports the failure to the calling model without leaking internals beyond
 * the tool's own message — the tools already speak in desk-friendly strings. */
function describeToolFailure(error: unknown): string {
  return error instanceof Error ? error.message : "The tool failed.";
}

/**
 * Adapts the SDK-free `@rtc/agent-tools` registry to an MCP `Server`. Uses the
 * LOW-LEVEL Server API on purpose: the registry stores raw JSON Schema, and
 * `setRequestHandler(ListToolsRequestSchema)` passes it through verbatim —
 * the high-level `McpServer.registerTool` is Zod-first and would force a
 * schema round-trip. One Server per call: stateless Streamable HTTP creates
 * a fresh instance per request, and the only shared state is the tool
 * definitions themselves (stateless closures over the injected ports).
 */
export function buildJarvisMcpServer(
  tools: readonly JarvisToolDefinition[],
): Server {
  const server = new Server(
    { name: JARVIS_MCP_SERVER_NAME, version: JARVIS_MCP_SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => {
    return Promise.resolve({
      tools: tools.map((tool): Tool => {
        return {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as Tool["inputSchema"],
        };
      }),
    });
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find((candidate) => {
      return candidate.name === request.params.name;
    });

    if (tool === undefined) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${request.params.name}`,
      );
    }

    try {
      const text = await tool.run(request.params.arguments ?? {});
      return { content: [{ type: "text", text }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: describeToolFailure(error) }],
        isError: true,
      };
    }
  });

  return server;
}
```

**Adaptation notes:** the exact exported names (`Server`, `McpError`, `ErrorCode`, `Tool`, request schemas) and the `inputSchema` cast target must be verified against `@modelcontextprotocol/sdk@1.30.0`'s actual `.d.ts` — read `node_modules/@modelcontextprotocol/sdk/dist/esm/types.d.ts` (or the package's `dist` layout) before writing imports; do not trust this plan's import paths over the installed package.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/server exec vitest run src/mcp/buildJarvisMcpServer.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/mcp/
git commit -m "feat(server): buildJarvisMcpServer — agent-tools registry as a low-level MCP server"
```

---

### Task 3: `createMcpRequestHandler` — bearer auth + stateless Streamable HTTP

**Files:**
- Create: `packages/server/src/mcp/mcpHttpHandler.ts`
- Test: `packages/server/src/mcp/mcpHttpHandler.test.ts`

**Interfaces:**
- Consumes: `buildJarvisMcpServer` (Task 2); `AuthService.verifyToken(token): VerifiedToken | null` (existing).
- Produces: `createMcpRequestHandler(deps: McpHandlerDeps): (req: IncomingMessage, res: ServerResponse) => void` where `McpHandlerDeps = { auth: Pick<AuthService, "verifyToken">, tools: readonly JarvisToolDefinition[] }`. Task 4 wires this into `index.ts`.

- [ ] **Step 1: Write the failing tests**

`packages/server/src/mcp/mcpHttpHandler.test.ts`:

```ts
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildJarvisTools, type ConfirmGate } from "@rtc/agent-tools";

import { AuthService, parseAuthUsers } from "../auth/AuthService.js";
import { createServices } from "../services/serviceContainer.js";
import { createMcpRequestHandler } from "./mcpHttpHandler.js";

const approveWithoutPrompt: ConfirmGate = () => {
  return Promise.resolve(true);
};

describe("createMcpRequestHandler", () => {
  let httpServer: HttpServer;
  let baseUrl: string;
  let auth: AuthService;

  beforeEach(async () => {
    auth = new AuthService({
      secret: "test-secret",
      ttlMs: 60_000,
      credentials: parseAuthUsers("demo:mcdc2026"),
    });
    const tools = buildJarvisTools({
      ...createServices(),
      confirmTrade: approveWithoutPrompt,
    });
    const serveMcp = createMcpRequestHandler({ auth, tools });
    httpServer = createServer((req, res) => {
      serveMcp(req, res);
    });
    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", resolve);
    });
    const address = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/mcp`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        return error ? reject(error) : resolve();
      });
    });
  });

  function authedTransport(token: string): StreamableHTTPClientTransport {
    return new StreamableHTTPClientTransport(new URL(baseUrl), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
  }

  it("a valid session token lists and calls tools over the real wire", async () => {
    const login = auth.login("demo", "mcdc2026");
    const client = new Client({ name: "vitest", version: "0.0.0" });
    await client.connect(authedTransport(login?.token ?? ""));

    const listed = await client.listTools();
    expect(listed.tools).toHaveLength(7);

    const result = await client.callTool({
      name: "list_currency_pairs",
      arguments: {},
    });
    const content = result.content as Array<{ text: string }>;
    expect(content[0]?.text).toContain("EURUSD");
    await client.close();
  });

  it("a missing Authorization header is rejected 401 before any MCP handling", async () => {
    const client = new Client({ name: "vitest", version: "0.0.0" });
    await expect(
      client.connect(new StreamableHTTPClientTransport(new URL(baseUrl))),
    ).rejects.toThrow(/401/);
  });

  it("an invalid token is rejected 401", async () => {
    const client = new Client({ name: "vitest", version: "0.0.0" });
    await expect(
      client.connect(authedTransport("not-a-real-token")),
    ).rejects.toThrow(/401/);
  });

  it("non-POST methods are rejected 405 (stateless endpoint)", async () => {
    const login = auth.login("demo", "mcdc2026");
    const response = await fetch(baseUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${login?.token ?? ""}` },
    });
    expect(response.status).toBe(405);
  });
});
```

**Adaptation notes:** `AuthService.login` returns `LoginResult | null` — read `packages/server/src/auth/AuthService.ts` for the exact result shape (`.token` field assumed here; verify). The `StreamableHTTPClientTransport` options key (`requestInit`) must be verified against the installed SDK's client `.d.ts`. A stateless server may respond to the client's initialize over POST with SSE or JSON — the SDK client handles both; do not assert on response framing, only on results and status codes.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rtc/server exec vitest run src/mcp/mcpHttpHandler.test.ts`
Expected: FAIL — cannot resolve `./mcpHttpHandler.js`.

- [ ] **Step 3: Implement**

`packages/server/src/mcp/mcpHttpHandler.ts`:

```ts
import type { IncomingMessage, ServerResponse } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import type { JarvisToolDefinition } from "@rtc/agent-tools";

import type { AuthService } from "../auth/AuthService.js";
import { buildJarvisMcpServer } from "./buildJarvisMcpServer.js";

export interface McpHandlerDeps {
  readonly auth: Pick<AuthService, "verifyToken">;
  readonly tools: readonly JarvisToolDefinition[];
}

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;

  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length);
}

/** Writes a JSON-RPC-shaped error so MCP clients surface a readable reason
 * instead of a bare status line. Never echoes the presented token. */
function rejectRequest(
  res: ServerResponse,
  status: number,
  message: string,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message },
      id: null,
    }),
  );
}

async function serveMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: McpHandlerDeps,
): Promise<void> {
  const token = bearerToken(req);

  if (token === null || deps.auth.verifyToken(token) === null) {
    rejectRequest(
      res,
      401,
      "Unauthorized: pass 'Authorization: Bearer <token>' using a session token from POST /login.",
    );
    return;
  }

  if (req.method !== "POST") {
    rejectRequest(
      res,
      405,
      "Method not allowed: this MCP endpoint is stateless and accepts POST only.",
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
 * WS upgrade), stateless Streamable HTTP over the low-level Jarvis server. */
export function createMcpRequestHandler(
  deps: McpHandlerDeps,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res): void => {
    serveMcpRequest(req, res, deps).catch(() => {
      if (!res.headersSent) {
        rejectRequest(res, 500, "Internal error handling the MCP request.");
      } else {
        res.end();
      }
    });
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rtc/server exec vitest run src/mcp/mcpHttpHandler.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/mcp/
git commit -m "feat(server): /mcp handler — bearer-authed stateless Streamable HTTP"
```

---

### Task 4: Mount `/mcp` in `index.ts`

**Files:**
- Modify: `packages/server/src/index.ts`

**Interfaces:**
- Consumes: `createMcpRequestHandler` (Task 3), `buildJarvisToolsFor` (existing, in this file), `auth` (existing).

- [ ] **Step 1: Wire the handler**

In `packages/server/src/index.ts`:

1. Add imports (respecting the existing grouped/sorted import order):

```ts
import { createMcpRequestHandler } from "./mcp/mcpHttpHandler.js";
```

2. After the `loginRateLimit` construction (before the `createServer` call), build the MCP wiring:

```ts
// ── MCP endpoint ────────────────────────────────────────────────

/** MCP-side HITL is the external client's job (Claude Desktop/Code ask
 * before every write tool), so our layer approves without prompting —
 * parent spec §3.4's "ungated at our layer" decision. */
const approveWithoutPrompt: ConfirmGate = () => {
  return Promise.resolve(true);
};

const serveMcp = createMcpRequestHandler({
  auth,
  tools: buildJarvisToolsFor(services, approveWithoutPrompt),
});
```

**Ordering note:** `auth` is declared *after* `services` in the current file; place this block after `auth`'s declaration. `ConfirmGate` is already imported from `@rtc/agent-tools` at the top of the file.

3. Inside the `createServer` request handler, directly before the final `res.writeHead(404)` fallthrough, add:

```ts
if (req.url === "/mcp" || req.url?.startsWith("/mcp?") === true) {
  serveMcp(req, res);
  return;
}
```

4. In the `httpServer.listen` startup log block, add one line:

```ts
console.log(`  MCP:   http://${HOSTNAME}:${PORT}/mcp (Streamable HTTP)`);
```

- [ ] **Step 2: Verify the wiring compiles and nothing regressed**

Run: `pnpm --filter @rtc/server build && pnpm --filter @rtc/server test`
Expected: PASS.

- [ ] **Step 3: Manual smoke (local, no key needed)**

Run in one terminal: `pnpm dev:ws`. In another:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"mcdc2026"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
curl -s -X POST http://localhost:4000/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Expected: a response listing the seven tools (JSON or SSE-framed). Also verify `curl -s -X POST http://localhost:4000/mcp -d '{}'` (no auth header) returns the 401 body. Record both outputs in the task report. (Adaptation note: verify the `/login` response's token field name against `LoginResponseDto` in `@rtc/shared` before scripting this.)

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat(server): mount the Jarvis MCP endpoint at /mcp"
```

---

### Task 5: Docs — architecture §18.14, CLAUDE.md, STATUS.md

**Files:**
- Modify: `docs/architecture/18-jarvis-ai-agent-surface.md` (append §18.14)
- Modify: `CLAUDE.md` (the `server/` package-structure line + the Agent-tools/Anthropic-SDK rule paragraph)
- Modify: `docs/STATUS.md` (Jarvis entry)

- [ ] **Step 1: Write §18.14**

Append a `### 18.14 P4 — the MCP endpoint (second transport)` section to `docs/architecture/18-jarvis-ai-agent-surface.md` covering, in this order (write real prose, not this outline):

- **Shape:** `packages/server/src/mcp/` — `buildJarvisMcpServer` (registry → low-level MCP `Server`; raw JSON Schema verbatim, no Zod) + `createMcpRequestHandler` (Bearer auth → stateless `StreamableHTTPServerTransport`, fresh pair per POST) — mounted at `/mcp` on the same `node:http` server `index.ts` already runs.
- **Same-process is the point:** the tools close over the same `ServiceContainer` the WS effects use, so an `execute_trade` from Claude Code lands in the running app's blotter (the Task 2 test pins this).
- **Auth:** `Authorization: Bearer <token>` against the same `AuthService` tokens `/login` issues; 401/405 as JSON-RPC-shaped bodies. Include the two-line demo recipe:

```bash
TOKEN=$(curl -s -X POST https://rtc-clone-server.fly.dev/login -H 'Content-Type: application/json' -d '{"username":"demo","password":"mcdc2026"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
claude mcp add --transport http rtc-desk http://localhost:4000/mcp --header "Authorization: Bearer $TOKEN"
```

  (Verify the token field name and the exact `claude mcp add` flag syntax before committing; use the local URL in the primary recipe and mention the deployed URL variant.)
- **execute_trade ungated here:** the external client's tool-approval surface is the architecturally honest HITL layer (parent §3.4); the injected `approveWithoutPrompt` gate makes that explicit in code. Contrast with the WS path's confirm-card round-trip.
- **Recorded deviations from parent §3.4:** (a) seven tools, not eight — `get_app_context` remains deferred (§18.13's decision); (b) mounted unconditionally rather than behind the Jarvis availability env gate — MCP brings its own model, needs no `ANTHROPIC_API_KEY`; auth is still mandatory. (c) session tokens over a static shared token — the auth overhaul (#210/#226/#234) postdates the spec, and reusing `AuthService` keeps one credential system.
- **Token TTL caveat:** tokens expire (`AUTH_TTL_MS`, default 8h) — an MCP client that starts failing with 401 needs a fresh `/login` token.

- [ ] **Step 2: Update CLAUDE.md**

In the package-structure table's `server/` line, extend the parenthetical to mention the MCP endpoint, e.g. append: `; plus the /mcp Streamable-HTTP endpoint (src/mcp/) exposing the agent-tools registry to external MCP clients — @modelcontextprotocol/sdk is likewise server-confined (dep-cruiser no-mcp-sdk-outside-server)`. In the **Agent-tools / Anthropic-SDK rule** paragraph, add one sentence noting the parallel MCP-SDK allowlist rule. Reference §18.14.

- [ ] **Step 3: Update STATUS.md**

Follow the `tracking-workstream-status` skill: update the Jarvis workstream entry — P4 shipped (this PR), next pending rung is P5+ (parent spec §10 roadmap); keep the still-pending user actions (live smoke, Fly deploy decision) if the entry lists them. Bump the `Last updated` date. Run `pnpm check:doc-links`.

- [ ] **Step 4: Verify and commit**

Run: `pnpm check:doc-links` — expected PASS.

```bash
git add docs/architecture/18-jarvis-ai-agent-surface.md CLAUDE.md docs/STATUS.md
git commit -m "docs(jarvis): §18.14 MCP endpoint receipt + CLAUDE.md + STATUS"
```

---

## Self-Review Notes

- **Spec coverage:** parent §3.4 requires: official SDK (Task 1), Streamable HTTP on the same HTTP server (Tasks 3–4), same process/same container (Task 2's blotter test), all tools exposed (Task 2; seven per the recorded deferral), ungated `execute_trade` (Global Constraints + Task 4's named gate), auth (Task 3), demo recipe (Task 5). Parent §4's MCP testing row — "MCP tests with the MCP SDK client in-process: `tools/list`, a read call, `execute_trade` then visible in the blotter" — is Task 2 verbatim plus Task 3's wire-level auth tests.
- **Type consistency:** `createMcpRequestHandler` name and `McpHandlerDeps` shape match between Tasks 3 and 4; `buildJarvisMcpServer(tools)` signature matches between Tasks 2 and 3; `approveWithoutPrompt` appears in Tasks 2, 3 (tests) and 4 (wiring) with the same definition.
- **Known risk:** SDK import paths / option names drift between minor versions — every task carries "verify against the installed `.d.ts`" adaptation notes; the implementer must read the installed package before writing imports and treat this plan's SDK snippets as intent, not gospel.
