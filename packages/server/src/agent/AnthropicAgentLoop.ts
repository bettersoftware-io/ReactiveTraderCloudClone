import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import type { BetaToolRunnerRequestOptions } from "@anthropic-ai/sdk/lib/tools/BetaToolRunner";

import type { ConfirmGate, JarvisToolDefinition } from "@rtc/agent-tools";

import {
  AnthropicAgentSession,
  type AnthropicRunner,
  type AnthropicRunnerFactory,
  type AnthropicToolRunnerRequest,
} from "./AnthropicAgentSession.js";
import type { AgentLoop, AgentSession } from "./agentLoop.js";

function buildDefaultRunnerFactory(client: Anthropic): AnthropicRunnerFactory {
  function runnerFactory(
    params: AnthropicToolRunnerRequest,
    options: BetaToolRunnerRequestOptions,
  ): AnthropicRunner {
    return client.beta.messages.toolRunner(params, options);
  }

  return runnerFactory;
}

/** The only host a person's key is sent to (spec §5.1). */
const OWN_KEY_BASE_URL = "https://api.anthropic.com";

/** The SDK reads `ANTHROPIC_CUSTOM_HEADERS` itself, with no option to turn it
 * off, and lets `defaultHeaders` override what it read. A null removes a
 * header, so this names each of them, split the way the SDK splits them. */
function clearedEnvHeaders(env: NodeJS.ProcessEnv): Record<string, null> {
  const cleared: Record<string, null> = {};

  for (const line of (env.ANTHROPIC_CUSTOM_HEADERS ?? "").split("\n")) {
    const colon = line.indexOf(":");

    if (colon >= 0) {
      cleared[line.slice(0, colon).trim()] = null;
    }
  }

  return cleared;
}

/** A client that answers to the person's key and nothing in the process
 * environment: the house deployment's bearer token, gateway host and custom
 * headers stay off it, a redirect cannot carry the key elsewhere, and the
 * SDK's own request logging stays off however `ANTHROPIC_LOG` is set. */
function ownKeyClientOptions(
  apiKey: string,
  env: NodeJS.ProcessEnv,
): ClientOptions {
  return {
    apiKey,
    authToken: null,
    baseURL: OWN_KEY_BASE_URL,
    defaultHeaders: clearedEnvHeaders(env),
    fetchOptions: { redirect: "error" },
    logLevel: "off",
  };
}

export interface AnthropicAgentLoopOptions {
  readonly apiKey: string;
  /** The key is a person's own, not the deployment's: see
   * `ownKeyClientOptions`. */
  readonly ownKey?: boolean;
  /**
   * Builds ONE session's `JarvisToolDefinition` set, given THAT session's own
   * `confirmTrade` gate. A flat, loop-level `JarvisToolDefinition[]` can't
   * work here: `execute_trade`'s gate closes over whichever session built it
   * (its push function, its pending-confirmation registry), so sharing one
   * array across sessions would let one connection's trade confirmation
   * leak into another's — exactly what carrying the P2 fix forward (each
   * session owns its own registry) rules out. Production wires
   * `(confirmTrade) => buildJarvisTools({ ...ports, confirmTrade })`; tests
   * inject a small fixture.
   */
  readonly buildTools: (
    confirmTrade: ConfirmGate,
  ) => readonly JarvisToolDefinition[];
  /** Injection seam — see `AnthropicRunnerFactory`'s doc comment
   * (`AnthropicAgentSession.ts`). Omitted in production, where the default
   * factory wraps a real `Anthropic` client built ONCE below. */
  readonly runnerFactory?: AnthropicRunnerFactory;
  /**
   * The tradeable-pair roster `render_panel`'s tool (LIVE brains only —
   * added inside `AnthropicAgentSession`'s own constructor, never through
   * `buildTools` above) validates `source.symbols` against. REQUIRED,
   * deliberately — `parsePanelSpec` treats an empty roster as "skip the
   * membership check" (see `RenderPanelDeps.knownSymbols`'s doc comment),
   * so an *optional* field here would let a future construction site that
   * simply forgets this option silently fail OPEN: model-authored
   * `source.symbols` would validate against nothing rather than being
   * rejected. Making it required turns that omission into a compile error
   * instead. (`AnthropicAgentSession`'s own constructor still defaults its
   * `knownSymbols` parameter to `[]` — that default is a test seam only;
   * every real construction path goes through this required option.)
   * Loop-level rather than per-session: unlike `execute_trade`'s
   * `ConfirmGate`, the pair roster doesn't vary per connection, so it needs
   * no per-session closure. Pass `[]` explicitly if a caller genuinely
   * wants no roster check.
   */
  readonly knownSymbols: readonly string[];
}

/**
 * `AgentLoop` over the real Claude tool-runner. The `Anthropic` client is
 * constructed ONCE here, in the constructor, and shared across every
 * session `createSession()` mints — `createSession()` itself does no SDK
 * client construction and makes no network call, only cheap allocation (see
 * `AnthropicAgentSession`'s doc comment). Usage is not metered here: each
 * turn brings its own meter (`JarvisTurnOptions.meter`), because whose
 * budget a request spends is known per connection, not per loop.
 */
export class AnthropicAgentLoop implements AgentLoop {
  private readonly runnerFactory: AnthropicRunnerFactory;

  private readonly buildTools: (
    confirmTrade: ConfirmGate,
  ) => readonly JarvisToolDefinition[];

  private readonly knownSymbols: readonly string[];

  constructor(options: AnthropicAgentLoopOptions) {
    this.buildTools = options.buildTools;
    this.knownSymbols = options.knownSymbols;
    this.runnerFactory =
      options.runnerFactory ??
      buildDefaultRunnerFactory(
        new Anthropic(
          options.ownKey
            ? ownKeyClientOptions(options.apiKey, process.env)
            : { apiKey: options.apiKey },
        ),
      );
  }

  createSession(): AgentSession {
    return new AnthropicAgentSession(
      this.runnerFactory,
      this.buildTools,
      this.knownSymbols,
    );
  }
}
