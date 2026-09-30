# @rtc/agent-tools

The framework-neutral Jarvis desk-tool registry: the seven tools an AI may
call, each a plain JSON Schema (`inputSchema`) plus a
`run(input): Promise<string>` handler over injected `@rtc/domain` ports.
`buildJarvisTools(deps)` (`src/buildJarvisTools.ts`) returns them — six
read-only tools (`list_currency_pairs`, `get_price`, `get_price_history`,
`get_blotter`, `get_analytics`, `get_service_health`) and the one
confirm-gated write tool, `execute_trade`, which asks the injected
`ConfirmGate` before it touches the `ExecutionPort`. The shapes
(`JarvisToolDefinition`, `JarvisToolDeps`, `ConfirmGate`) are in
`src/jarvisToolDefinition.ts`; `src/index.ts` is the whole public surface.

**SDK-free rule** (dependency-cruiser `agent-tools-stays-inner`): imports only
`@rtc/domain` (+ `rxjs`) — never `@rtc/shared`, a client, the bindings or the
server. The Anthropic and MCP SDKs are confined to `@rtc/server`
(`no-anthropic-sdk-in-inner-packages`, `no-mcp-sdk-outside-server`), which
adapts these definitions to each transport: `AnthropicAgentLoop` for the chat
loop, `buildJarvisMcpServer` for the `/mcp` endpoint. That is why the registry
carries raw JSON Schema rather than an SDK's tool type.

| | |
|---|---|
| **Runtime deps** | `@rtc/domain`, `rxjs` (`package.json` `dependencies`) |
| **Consumed by** | `@rtc/server` only (`grep -rl "@rtc/agent-tools" packages/*/package.json`) |

See [§18.13](../../docs/architecture/18-jarvis-ai-agent-surface.md#1813-phase-3-shipped--the-real-loop)
and [§18.14](../../docs/architecture/18-jarvis-ai-agent-surface.md#1814-p4--the-mcp-endpoint-second-transport)
for how the two transports use it.
