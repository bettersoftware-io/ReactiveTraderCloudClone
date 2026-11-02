import type { ConfirmGate, JarvisToolDefinition } from "@rtc/agent-tools";

import type { AgentLoop, AgentSession } from "./agentLoop.js";
import {
  OpenAiCompatibleAgentSession,
  type OpenAiCompatibleEndpoint,
} from "./OpenAiCompatibleAgentSession.js";

/** One OpenAI-compatible provider: its fixed host and what its requests need
 * beyond the common shape. Server-side only; never taken from a client. */
export interface OpenAiCompatibleConfig {
  /** Up to and including the API version, e.g. `https://api.openai.com/v1`;
   * requests go to `{baseUrl}/chat/completions`. */
  readonly baseUrl: string;
  /** Sent on every request. They cannot replace the key's `Authorization`
   * or the `Content-Type`. */
  readonly headers: Readonly<Record<string, string>>;
  /** OpenAI's newer models take `max_completion_tokens`, others
   * `max_tokens`. */
  readonly tokenLimitParam: "max_tokens" | "max_completion_tokens";
  /** Extra request fields (OpenRouter's `usage: { include: true }`). They
   * cannot replace the request's own fields. */
  readonly extraBody?: Readonly<Record<string, unknown>>;
}

export interface OpenAiCompatibleAgentLoopOptions {
  readonly config: OpenAiCompatibleConfig;
  /** The person's own key, for this connection only. */
  readonly key: string;
  /** Builds ONE session's tools, given that session's own confirm gate —
   * see `AnthropicAgentLoopOptions.buildTools`. */
  readonly buildTools: (
    confirmTrade: ConfirmGate,
  ) => readonly JarvisToolDefinition[];
  /** The pair roster `render_panel` checks symbols against; required for
   * the reason `AnthropicAgentLoopOptions.knownSymbols` gives. */
  readonly knownSymbols: readonly string[];
  /** Test seam; the global `fetch` otherwise. */
  readonly fetchFn?: typeof fetch;
}

/** Header names compared case-insensitively, as HTTP does. */
function withoutHeaders(
  headers: Readonly<Record<string, string>>,
  names: readonly string[],
): Record<string, string> {
  const kept: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (!names.includes(name.toLowerCase())) {
      kept[name] = value;
    }
  }

  return kept;
}

/** The global `fetch`, looked up at each call rather than captured once. */
function fetchGlobally(
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, init);
}

/**
 * `AgentLoop` over an OpenAI-compatible chat-completions endpoint, for a key
 * a person brought (OpenRouter, OpenAI). Built per connection with that
 * connection's key, as `AnthropicAgentLoop` is with `ownKey: true`; it reads
 * nothing from the environment. `createSession()` allocates only.
 */
export class OpenAiCompatibleAgentLoop implements AgentLoop {
  private readonly endpoint: OpenAiCompatibleEndpoint;

  private readonly buildTools: (
    confirmTrade: ConfirmGate,
  ) => readonly JarvisToolDefinition[];

  private readonly knownSymbols: readonly string[];

  constructor(options: OpenAiCompatibleAgentLoopOptions) {
    const { config } = options;

    this.buildTools = options.buildTools;
    this.knownSymbols = options.knownSymbols;
    this.endpoint = {
      url: `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`,
      headers: {
        ...withoutHeaders(config.headers, ["authorization", "content-type"]),
        Authorization: `Bearer ${options.key}`,
        "Content-Type": "application/json",
      },
      tokenLimitParam: config.tokenLimitParam,
      extraBody: config.extraBody ?? {},
      fetchFn: options.fetchFn ?? fetchGlobally,
    };
  }

  createSession(): AgentSession {
    return new OpenAiCompatibleAgentSession(
      this.endpoint,
      this.buildTools,
      this.knownSymbols,
    );
  }
}
