import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildJarvisTools } from "@rtc/agent-tools";

import type {
  AccountLookup,
  AccountRecord,
} from "../accounts/AccountDirectory.js";
import { createRevocationLedger } from "../accounts/revocationLedger.js";
import { AuthService, parseAuthUsers } from "../auth/AuthService.js";
import { signToken } from "../auth/token.js";
import { createServices } from "../services/serviceContainer.js";
import { createMcpRequestHandler } from "./mcpHttpHandler.js";

describe("createMcpRequestHandler", () => {
  beforeEach(async () => {
    findAccountError = null;
    lookup = { outcome: "found", account: createRecord({}) };
    revocations = createRevocationLedger(10);
    auth = new AuthService({
      secret: SECRET,
      ttlMs: 60_000,
      credentials: parseAuthUsers("demo:mcdc2026"),
    });
    const tools = buildJarvisTools({
      ...createServices(),
      confirmTrade: approveWithoutPrompt,
    });

    const serveMcp = createMcpRequestHandler({
      auth,
      tools,
      accounts: {
        findAccount: (): Promise<AccountLookup> => {
          return findAccountError === null
            ? Promise.resolve(lookup)
            : Promise.reject(findAccountError);
        },
      },
      revocations,
    });
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

  it("an administrator's session token lists and calls tools over the real wire", async () => {
    const client = new Client({ name: "vitest", version: "0.0.0" });
    await client.connect(authedTransport(adminToken()));

    const listed = await client.listTools();
    expect(listed.tools).toHaveLength(7);

    const result = await client.callTool({
      name: "list_currency_pairs",
      arguments: {},
    });
    const content = result.content as TextContentBlock[];
    expect(content[0]?.text).toContain("EURUSD");
    await client.close();
  });

  it("a valid token with a lowercase 'bearer' scheme still lists tools", async () => {
    const client = new Client({ name: "vitest", version: "0.0.0" });
    await client.connect(authedTransport(adminToken(), "bearer"));

    const listed = await client.listTools();
    expect(listed.tools).toHaveLength(7);
    await client.close();
  });

  it("a missing Authorization header is rejected 401 before any MCP handling", async () => {
    const client = new Client({ name: "vitest", version: "0.0.0" });
    await expect(
      client.connect(new StreamableHTTPClientTransport(new URL(baseUrl))),
    ).rejects.toMatchObject({ code: 401 });
  });

  it("an invalid token is rejected 401", async () => {
    const client = new Client({ name: "vitest", version: "0.0.0" });
    await expect(
      client.connect(authedTransport("not-a-real-token")),
    ).rejects.toMatchObject({ code: 401 });
  });

  it("refuses a roster login with 403 admin_only, before any MCP handling", async () => {
    const login = await auth.login("demo", "mcdc2026");

    await expectAdminOnly(login?.token ?? "");
  });

  it("refuses an account whose current record is a user", async () => {
    lookup = { outcome: "found", account: createRecord({ access: "user" }) };

    await expectAdminOnly(adminToken());
  });

  it("refuses an administrator who has since been blocked", async () => {
    lookup = { outcome: "found", account: createRecord({ status: "blocked" }) };

    await expectAdminOnly(adminToken());
  });

  it("refuses an administrator whose account is gone", async () => {
    lookup = { outcome: "missing" };

    await expectAdminOnly(adminToken());
  });

  it("refuses an administrator whose token predates the account's stamp", async () => {
    lookup = {
      outcome: "found",
      account: createRecord({ sessionsNotBefore: Date.now() + 5_000 }),
    };

    await expectAdminOnly(adminToken());
  });

  it("refuses an administrator whose token predates the ledger's stamp", async () => {
    revocations.record(ADMIN_ID, Date.now() + 5_000);

    await expectAdminOnly(adminToken());
  });

  it("an administrator with a live session passes the gate (a GET then meets the POST-only rule)", async () => {
    const response = await fetch(baseUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    expect(response.status).toBe(405);
  });

  it("answers 503 (never admits) when the directory throws", async () => {
    findAccountError = new Error("socket hang up");

    const response = await postToolsList(adminToken());

    expect(response.status).toBe(503);
  });

  it("answers 503 when the directory cannot be read", async () => {
    lookup = { outcome: "unavailable" };

    const response = await postToolsList(adminToken());

    expect(response.status).toBe(503);
  });

  it("non-POST methods are rejected 405 (stateless endpoint) with an Allow header", async () => {
    const response = await fetch(baseUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  let httpServer: HttpServer;

  let baseUrl: string;

  let auth: AuthService;

  let lookup: AccountLookup;

  let findAccountError: Error | null;

  let revocations: ReturnType<typeof createRevocationLedger>;

  function adminToken(): string {
    return signToken("ann@desk.io", SECRET, 60_000, Date.now(), {
      accountId: ADMIN_ID,
      access: "admin",
    });
  }

  function postToolsList(token: string): Promise<Response> {
    return fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
  }

  async function expectAdminOnly(token: string): Promise<void> {
    const response = await postToolsList(token);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      error: { code: -32000, message: "admin_only" },
      id: null,
    });
  }

  function authedTransport(
    token: string,
    scheme = "Bearer",
  ): StreamableHTTPClientTransport {
    return new StreamableHTTPClientTransport(new URL(baseUrl), {
      requestInit: { headers: { Authorization: `${scheme} ${token}` } },
    });
  }
});

function createRecord(overrides: Partial<AccountRecord>): AccountRecord {
  return {
    id: ADMIN_ID,
    email: "ann@desk.io",
    displayName: "Ann",
    access: "admin",
    status: "active",
    createdAt: 0,
    sessionsNotBefore: null,
    ...overrides,
  };
}

function approveWithoutPrompt(): Promise<boolean> {
  return Promise.resolve(true);
}

interface TextContentBlock {
  readonly text: string;
}

const SECRET = "test-secret";

const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
