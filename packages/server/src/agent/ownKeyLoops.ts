import type { ConfirmGate, JarvisToolDefinition } from "@rtc/agent-tools";
import type { JarvisProvider } from "@rtc/domain";

import { AnthropicAgentLoop } from "./AnthropicAgentLoop.js";
import type { AgentLoop, OwnKeyLoopBuilder } from "./agentLoop.js";
import {
  OpenAiCompatibleAgentLoop,
  type OpenAiCompatibleConfig,
} from "./OpenAiCompatibleAgentLoop.js";

/** The providers whose own keys run on the OpenAI-compatible loop. */
export type OpenAiCompatibleProvider = Exclude<JarvisProvider, "anthropic">;

/**
 * Each OpenAI-compatible provider's fixed host and request shape (spec §5.1).
 * Never taken from a client: the client names a provider from a closed set.
 *
 * Both switch reasoning off on every request. OpenAI's Chat Completions runs
 * function tools only with `reasoning_effort: "none"` on its current models,
 * and with reasoning off every output token streams as text or a tool call,
 * so a cancelled request booked from what it streamed books all of it. The
 * curated models (`JARVIS_OWN_MODELS`) are ones that accept it.
 */
export const OWN_KEY_CHAT_CONFIGS: Readonly<
  Record<OpenAiCompatibleProvider, OpenAiCompatibleConfig>
> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    headers: {},
    // `max_tokens` is deprecated in OpenAI's Chat Completions.
    tokenLimitParam: "max_completion_tokens",
    extraBody: { reasoning_effort: "none" },
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    headers: {},
    // Some of OpenRouter's models take only `max_tokens`.
    tokenLimitParam: "max_tokens",
    extraBody: {
      // OpenRouter reports each reply's cost in `usage.cost`, and the turn
      // books it (spec §5.4). Its docs now say usage comes on every reply;
      // asking still costs nothing and keeps the cost coming if it changes.
      usage: { include: true },
      reasoning: { effort: "none" },
      // Only providers that honour every field above, the tools included,
      // may serve the request: one that ignored `reasoning` would think
      // unseen.
      provider: { require_parameters: true },
    },
  },
};

export interface OwnKeyLoopDeps {
  /** Builds one session's tools, given that session's confirm gate. */
  readonly buildTools: (
    confirmTrade: ConfirmGate,
  ) => readonly JarvisToolDefinition[];
  /** The pair roster `render_panel` checks symbols against. */
  readonly knownSymbols: readonly string[];
  /** Test and probe seam; the global `fetch` otherwise. */
  readonly fetchFn?: typeof fetch;
}

/**
 * The builder `jarvisEffects` calls for an accepted own key: Anthropic's key
 * runs on `AnthropicAgentLoop`, OpenRouter's and OpenAI's on
 * `OpenAiCompatibleAgentLoop` with their config above. One loop per
 * connection's key (D16); it reads nothing from the environment.
 */
export function createOwnKeyLoopBuilder(
  deps: OwnKeyLoopDeps,
): OwnKeyLoopBuilder {
  return (provider: JarvisProvider, key: string): AgentLoop => {
    if (provider === "anthropic") {
      return new AnthropicAgentLoop({
        apiKey: key,
        ownKey: true,
        buildTools: deps.buildTools,
        knownSymbols: deps.knownSymbols,
        ...(deps.fetchFn === undefined ? {} : { fetchFn: deps.fetchFn }),
      });
    }

    return new OpenAiCompatibleAgentLoop({
      config: OWN_KEY_CHAT_CONFIGS[provider],
      key,
      buildTools: deps.buildTools,
      knownSymbols: deps.knownSymbols,
      ...(deps.fetchFn === undefined ? {} : { fetchFn: deps.fetchFn }),
    });
  };
}
