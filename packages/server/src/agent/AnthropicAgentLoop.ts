import Anthropic from "@anthropic-ai/sdk";
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

export interface AnthropicAgentLoopOptions {
  readonly apiKey: string;
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
}

/**
 * `AgentLoop` over the real Claude tool-runner. The `Anthropic` client is
 * constructed ONCE here, in the constructor, and shared across every
 * session `createSession()` mints — `createSession()` itself does no SDK
 * client construction and makes no network call, only cheap allocation (see
 * `AnthropicAgentSession`'s doc comment).
 */
export class AnthropicAgentLoop implements AgentLoop {
  private readonly runnerFactory: AnthropicRunnerFactory;

  private readonly buildTools: (
    confirmTrade: ConfirmGate,
  ) => readonly JarvisToolDefinition[];

  constructor(options: AnthropicAgentLoopOptions) {
    this.buildTools = options.buildTools;
    this.runnerFactory =
      options.runnerFactory ??
      buildDefaultRunnerFactory(new Anthropic({ apiKey: options.apiKey }));
  }

  createSession(): AgentSession {
    return new AnthropicAgentSession(this.runnerFactory, this.buildTools);
  }
}
