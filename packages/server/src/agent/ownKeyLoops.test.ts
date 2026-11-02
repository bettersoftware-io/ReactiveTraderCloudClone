import { afterEach, describe, expect, it, vi } from "vitest";

import type { JarvisToolDefinition } from "@rtc/agent-tools";
import {
  JARVIS_OWN_PROVIDERS,
  type JarvisEvent,
  type JarvisLiveBrain,
  type JarvisOwnBrain,
  ownModelsFor,
} from "@rtc/domain";

import type { TurnMeter } from "../services/jarvisBudget/JarvisBudgetService.js";
import { OWN_KEY_ENDPOINTS } from "../services/ownKey/ownKeyEndpoints.js";
import {
  estimateUsageCostUsd,
  type JarvisTokenUsage,
} from "../services/UsageMeter.js";
import { AnthropicAgentLoop } from "./AnthropicAgentLoop.js";
import type { AgentLoop, JarvisTurnOptions } from "./agentLoop.js";
import {
  createFakeChatProvider,
  FAKE_COMPLETION_TOKENS,
  FAKE_PROMPT_TOKENS,
} from "./fakeChatProvider.testHelpers.js";
import { OpenAiCompatibleAgentLoop } from "./OpenAiCompatibleAgentLoop.js";
import {
  createOwnKeyLoopBuilder,
  OWN_KEY_CHAT_CONFIGS,
} from "./ownKeyLoops.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("own-key loops", () => {
  it("every provider in JARVIS_OWN_PROVIDERS has models and an endpoint", () => {
    for (const provider of JARVIS_OWN_PROVIDERS) {
      expect(ownModelsFor(provider).length).toBeGreaterThan(0);

      const check = new URL(OWN_KEY_ENDPOINTS[provider].url);

      expect(check.protocol).toBe("https:");
      // The key is checked on the host its turns go to.
      expect(check.host).toBe(
        provider === "anthropic"
          ? "api.anthropic.com"
          : new URL(OWN_KEY_CHAT_CONFIGS[provider].baseUrl).host,
      );
    }
  });

  it("the builder routes each provider to the right loop and host", async () => {
    const openai = createFakeChatProvider({ toolName: TOOL.name });
    const openrouter = createFakeChatProvider({ toolName: TOOL.name });

    const openaiLoop = createLoopBuilderWith(openai.fetchFn)("openai", OWN_KEY);
    const openrouterLoop = createLoopBuilderWith(openrouter.fetchFn)(
      "openrouter",
      OWN_KEY,
    );

    expect(openaiLoop).toBeInstanceOf(OpenAiCompatibleAgentLoop);
    expect(openrouterLoop).toBeInstanceOf(OpenAiCompatibleAgentLoop);

    await runTurn(openaiLoop, { brain: "own:openai:gpt-6-luna" });
    await runTurn(openrouterLoop, {
      brain: "own:openrouter:deepseek/deepseek-v4.1-flash",
    });

    const [openaiRequest] = openai.requests;
    const [openrouterRequest] = openrouter.requests;

    expect(openaiRequest?.url).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
    expect(openaiRequest?.headers.get("authorization")).toBe(
      `Bearer ${OWN_KEY}`,
    );
    expect(openaiRequest?.body).toMatchObject({
      model: "gpt-6-luna",
      max_completion_tokens: expect.any(Number),
      // OpenAI's Chat Completions runs function tools only with reasoning
      // off, and reasoning off keeps every output token visible to the
      // ledger.
      reasoning_effort: "none",
    });
    expect(openaiRequest?.body).not.toHaveProperty("max_tokens");

    expect(openrouterRequest?.url).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
    expect(openrouterRequest?.headers.get("authorization")).toBe(
      `Bearer ${OWN_KEY}`,
    );
    expect(openrouterRequest?.body).toMatchObject({
      model: "deepseek/deepseek-v4.1-flash",
      max_tokens: expect.any(Number),
      reasoning: { effort: "none" },
      usage: { include: true },
      provider: { require_parameters: true },
    });
    expect(openrouterRequest?.body).not.toHaveProperty("max_completion_tokens");

    const anthropic = createFakeChatProvider({
      toolName: TOOL.name,
      failWith: { status: 400, body: { type: "error" } },
    });

    const anthropicLoop = createLoopBuilderWith(anthropic.fetchFn)(
      "anthropic",
      OWN_KEY,
    );

    expect(anthropicLoop).toBeInstanceOf(AnthropicAgentLoop);

    vi.spyOn(console, "error").mockImplementation(() => {});
    await runTurn(anthropicLoop, { brain: "own:anthropic:claude-haiku-4-5" });

    const [anthropicRequest] = anthropic.requests;
    const anthropicUrl = new URL(anthropicRequest?.url ?? "");

    expect(anthropicUrl.host).toBe("api.anthropic.com");
    expect(anthropicUrl.pathname).toBe("/v1/messages");
    expect(anthropicRequest?.headers.get("x-api-key")).toBe(OWN_KEY);
  });

  it("OpenRouter books the reported cost; OpenAI books the listed price", async () => {
    const openrouter = createFakeChatProvider({
      toolName: TOOL.name,
      reportedCostUsd: REPORTED_COST_USD,
    });

    const openai = createFakeChatProvider({
      toolName: TOOL.name,
      reportedCostUsd: REPORTED_COST_USD,
    });

    const openrouterBrain: JarvisOwnBrain =
      "own:openrouter:deepseek/deepseek-v4.1-flash";
    const openaiBrain: JarvisOwnBrain = "own:openai:gpt-6-luna";
    const openrouterBooked = createBookingMeter();
    const openaiBooked = createBookingMeter();

    await runTurn(
      createLoopBuilderWith(openrouter.fetchFn)("openrouter", OWN_KEY),
      {
        brain: openrouterBrain,
        meter: openrouterBooked.meter,
      },
    );
    await runTurn(createLoopBuilderWith(openai.fetchFn)("openai", OWN_KEY), {
      brain: openaiBrain,
      meter: openaiBooked.meter,
    });

    // A tool call, then the reply: two requests each.
    expect(openrouterBooked.costsUsd()).toEqual([
      REPORTED_COST_USD,
      REPORTED_COST_USD,
    ]);

    const [luna] = ownModelsFor("openai");
    const listed =
      (FAKE_PROMPT_TOKENS * (luna?.inputUsdPerMtok ?? Number.NaN) +
        FAKE_COMPLETION_TOKENS * (luna?.outputUsdPerMtok ?? Number.NaN)) /
      1_000_000;

    expect(openaiBooked.costsUsd()).toHaveLength(2);

    for (const cost of openaiBooked.costsUsd()) {
      expect(cost).toBeCloseTo(listed, 12);
    }
  });
});

interface BookingMeter {
  readonly meter: TurnMeter;
  readonly costsUsd: () => number[];
}

/** A meter that books every request's usage at what the budget would. */
function createBookingMeter(): BookingMeter {
  const booked: [JarvisLiveBrain, JarvisTokenUsage][] = [];

  return {
    meter: {
      beginRequest: (): void => {},
      record: (brain: JarvisLiveBrain, usage: JarvisTokenUsage): void => {
        booked.push([brain, usage]);
      },
      endRequest: (): void => {},
      exhausted: (): boolean => {
        return false;
      },
    },
    costsUsd: (): number[] => {
      return booked.map(([brain, usage]) => {
        return estimateUsageCostUsd(brain, usage);
      });
    },
  };
}

function createLoopBuilderWith(
  fetchFn: typeof fetch,
): ReturnType<typeof createOwnKeyLoopBuilder> {
  return createOwnKeyLoopBuilder({
    buildTools: () => {
      return [TOOL];
    },
    knownSymbols: [],
    fetchFn,
  });
}

function runTurn(
  loop: AgentLoop,
  options: JarvisTurnOptions,
): Promise<JarvisEvent[]> {
  return new Promise((resolve, reject) => {
    const events: JarvisEvent[] = [];

    loop
      .createSession()
      .runTurn("ping", [], options)
      .subscribe({
        next: (event: JarvisEvent): void => {
          events.push(event);
        },
        error: reject,
        complete: (): void => {
          resolve(events);
        },
      });
  });
}

const OWN_KEY = "sk-own-loop-test";

/** A few hundredths of a cent, as a short request costs. */
const REPORTED_COST_USD = 0.0007;

const TOOL: JarvisToolDefinition = {
  name: "probe_echo",
  description: "answers with a fixed word",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  run: (): Promise<string> => {
    return Promise.resolve("echoed");
  },
};
