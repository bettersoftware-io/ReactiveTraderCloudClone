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
      // InvalidParams, not MethodNotFound: the JSON-RPC *method* (tools/call)
      // is implemented — it's the tool name argument that's bad. MethodNotFound
      // (-32601) would tell a strict client that tools/call itself is
      // unsupported. Matches the SDK's own McpServer's "Tool X not found".
      throw new McpError(
        ErrorCode.InvalidParams,
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
