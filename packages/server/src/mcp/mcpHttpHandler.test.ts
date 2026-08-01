import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildJarvisTools } from "@rtc/agent-tools";

import { AuthService, parseAuthUsers } from "../auth/AuthService.js";
import { createServices } from "../services/serviceContainer.js";
import { createMcpRequestHandler } from "./mcpHttpHandler.js";

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

  function authedTransport(
    token: string,
    scheme = "Bearer",
  ): StreamableHTTPClientTransport {
    return new StreamableHTTPClientTransport(new URL(baseUrl), {
      requestInit: { headers: { Authorization: `${scheme} ${token}` } },
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
    const content = result.content as TextContentBlock[];
    expect(content[0]?.text).toContain("EURUSD");
    await client.close();
  });

  it("a valid token with a lowercase 'bearer' scheme still lists tools", async () => {
    const login = auth.login("demo", "mcdc2026");
    const client = new Client({ name: "vitest", version: "0.0.0" });
    await client.connect(authedTransport(login?.token ?? "", "bearer"));

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

  it("non-POST methods are rejected 405 (stateless endpoint) with an Allow header", async () => {
    const login = auth.login("demo", "mcdc2026");
    const response = await fetch(baseUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${login?.token ?? ""}` },
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });
});

function approveWithoutPrompt(): Promise<boolean> {
  return Promise.resolve(true);
}

interface TextContentBlock {
  readonly text: string;
}
