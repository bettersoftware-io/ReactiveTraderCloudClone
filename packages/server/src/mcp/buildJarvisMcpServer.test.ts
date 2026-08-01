import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildJarvisTools } from "@rtc/agent-tools";

import { createServices } from "../services/serviceContainer.js";
import {
  buildJarvisMcpServer,
  JARVIS_MCP_SERVER_NAME,
  JARVIS_MCP_SERVER_VERSION,
} from "./buildJarvisMcpServer.js";

describe("buildJarvisMcpServer", () => {
  let connections: ConnectedClient[] = [];

  beforeEach(() => {
    connections = [];
    // ExecutionSimulator fills after Math.random() * 2000 ms; pin to zero so
    // the execute_trade round-trip is instant under real timers (fake timers
    // would stall the transport's internal promises).
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(async () => {
    for (const connection of connections) {
      await connection.client.close();
      await connection.server.close();
    }

    vi.restoreAllMocks();
  });

  it("lists exactly the seven desk tools with their JSON Schemas verbatim", async () => {
    const tools = buildJarvisTools({
      ...createServices(),
      confirmTrade: approveWithoutPrompt,
    });
    const { client } = await connect(connections, tools);

    const listed = await client.listTools();

    const names = listed.tools
      .map((tool) => {
        return tool.name;
      })
      .sort();
    expect(names).toEqual([
      "execute_trade",
      "get_analytics",
      "get_blotter",
      "get_price",
      "get_price_history",
      "get_service_health",
      "list_currency_pairs",
    ]);

    // Every tool's JSON Schema and description must pass through verbatim —
    // execute_trade's direction enum array is the construct most worth
    // pinning, since it's the one place a lossy round-trip would show up.
    for (const source of tools) {
      const listedTool = listed.tools.find((tool) => {
        return tool.name === source.name;
      });
      expect(listedTool?.inputSchema).toEqual(source.inputSchema);
      expect(listedTool?.description).toBe(source.description);
    }

    expect(client.getServerVersion()).toEqual({
      name: JARVIS_MCP_SERVER_NAME,
      version: JARVIS_MCP_SERVER_VERSION,
    });
  });

  it("dispatches tools/call to the tool's run and returns its string as text content", async () => {
    const tools = buildJarvisTools({
      ...createServices(),
      confirmTrade: approveWithoutPrompt,
    });
    const { client } = await connect(connections, tools);

    const result = await client.callTool({
      name: "list_currency_pairs",
      arguments: {},
    });

    const content = result.content as TextContent[];
    expect(content[0]?.type).toBe("text");
    expect(content[0]?.text).toContain("EURUSD");
    expect(result.isError).toBeFalsy();
  });

  it("an unknown tool name is a JSON-RPC error, not a tool result", async () => {
    const tools = buildJarvisTools({
      ...createServices(),
      confirmTrade: approveWithoutPrompt,
    });
    const { client } = await connect(connections, tools);

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
    const { client } = await connect(connections, [explodingTool]);

    const result = await client.callTool({ name: "explode", arguments: {} });

    expect(result.isError).toBe(true);
    const content = result.content as TextContent[];
    expect(content[0]?.text).toContain("boom");
  });

  it("execute_trade through MCP lands the trade on the SAME services' blotter (same-process proof)", async () => {
    const services = createServices();
    const tools = buildJarvisTools({
      ...services,
      confirmTrade: approveWithoutPrompt,
    });
    const { client } = await connect(connections, tools);

    const result = await client.callTool({
      name: "execute_trade",
      arguments: { symbol: "EURUSD", direction: "Buy", notional: 1_000_000 },
    });

    const content = result.content as TextContent[];
    const parsed = JSON.parse(content[0]?.text ?? "{}") as ExecuteTradeResult;
    expect(parsed.status).toBe("Done");

    const blotterResult = await client.callTool({
      name: "get_blotter",
      arguments: {},
    });
    const blotterContent = blotterResult.content as TextContent[];
    const blotter = JSON.parse(
      blotterContent[0]?.text ?? "{}",
    ) as BlotterSnapshot;
    expect(
      blotter.trades.some((trade) => {
        return trade.tradeId === parsed.tradeId;
      }),
    ).toBe(true);
  }, 15_000);
});

/** MCP-side HITL is the external client's job (parent spec §3.4) — this gate
 * approves every trade so the tool executes when the client has already
 * asked its own user. Structurally satisfies `ConfirmGate` (fewer params than
 * the declared signature is a valid implementation). */
function approveWithoutPrompt(): Promise<boolean> {
  return Promise.resolve(true);
}

interface ConnectedClient {
  readonly client: Client;
  readonly server: ReturnType<typeof buildJarvisMcpServer>;
}

/** Connects a fresh in-memory client/server pair and registers it in
 * `connections` so the describe block's `afterEach` closes both sides —
 * neither transport self-closes, so an unclosed pair would leak past its
 * test. */
async function connect(
  connections: ConnectedClient[],
  tools: ReturnType<typeof buildJarvisTools>,
): Promise<ConnectedClient> {
  const server = buildJarvisMcpServer(tools);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "vitest", version: "0.0.0" });
  await client.connect(clientTransport);
  const connection = { client, server };
  connections.push(connection);
  return connection;
}

interface TextContent {
  readonly type: string;
  readonly text: string;
}

interface ExecuteTradeResult {
  readonly status: string;
  readonly tradeId: number;
}

interface BlotterTrade {
  readonly tradeId: number;
}

interface BlotterSnapshot {
  readonly trades: readonly BlotterTrade[];
}
