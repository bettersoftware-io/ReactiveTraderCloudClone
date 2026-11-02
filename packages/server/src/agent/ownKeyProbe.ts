import type { JarvisToolDefinition } from "@rtc/agent-tools";
import {
  type JarvisEvent,
  type JarvisLiveBrain,
  type JarvisOwnModel,
  type JarvisProvider,
  ownModelsFor,
} from "@rtc/domain";

import type { TurnMeter } from "../services/jarvisBudget/JarvisBudgetService.js";
import { OWN_KEY_ENDPOINTS } from "../services/ownKey/ownKeyEndpoints.js";
import { verifyOwnKey } from "../services/ownKey/verifyOwnKey.js";
import {
  estimateUsageCostUsd,
  type JarvisTokenUsage,
} from "../services/UsageMeter.js";
import type { AgentSession } from "./agentLoop.js";
import { createOwnKeyLoopBuilder } from "./ownKeyLoops.js";

/** The one tool the probe gives the model. */
export const PROBE_TOOL_NAME = "probe_echo";

/** What the probe tool answers; the reply must carry it back. */
const PROBE_ANSWER = "PROBE-ANSWER-4417";

const PROBE_PROMPT = `Call the ${PROBE_TOOL_NAME} tool once, then reply with exactly the word it returned.`;

/** How long one model's turn may take before it counts as failed. */
const PROBE_TURN_TIMEOUT_MS = 120_000;

/** How much of a failed request's body is read for its error type. */
const ERROR_BODY_MAX_CHARS = 4_096;

export interface OwnKeyProbeOptions {
  readonly provider: JarvisProvider;
  /** The person's key: sent to the provider only, never printed. */
  readonly key: string;
  /** The global `fetch` in the script; a fake provider in a test. */
  readonly fetchFn: typeof fetch;
  readonly print: (line: string) => void;
}

/** What a provider said when it refused a request: status, and the error's
 * type and code when its body has them. Never its message. */
interface RefusedRequest {
  readonly status: number;
  readonly type: string | null;
  readonly code: string | null;
}

interface RecordingFetch {
  readonly fetchFn: typeof fetch;
  /** The last request a provider refused since `reset`. */
  readonly lastRefusal: () => RefusedRequest | null;
  /** Reasoning tokens the replies reported since `reset`. */
  readonly reasoningTokens: () => number;
  readonly reset: () => void;
}

interface TurnRecord {
  readonly events: readonly JarvisEvent[];
  readonly timedOut: boolean;
}

/**
 * The real-key check spec §5.1 asks for before merge: one tool-calling turn
 * on each listed model of `provider`, through the same loop and provider
 * config the server runs. Prints the key check (with its URL, so a changed
 * path shows), then PASS or FAIL per model, and returns whether every line
 * passed. A model fails when its turn errs, when the probe tool never runs,
 * when the reply does not carry the tool's answer back, or when it spent
 * reasoning tokens (the listed models run with reasoning off). A refused
 * request prints its status and error type, never its message, which can
 * quote the request. The key is never printed.
 */
export async function probeOwnKey(
  options: OwnKeyProbeOptions,
): Promise<boolean> {
  const { provider, key, print } = options;
  const keyAccepted = await checkKey(options);

  if (!keyAccepted) {
    return false;
  }

  const recorder = createRecordingFetch(options.fetchFn);
  let toolRuns = 0;
  const buildLoop = createOwnKeyLoopBuilder({
    buildTools: (): readonly JarvisToolDefinition[] => {
      return [
        createProbeTool(() => {
          toolRuns += 1;
        }),
      ];
    },
    knownSymbols: [],
    fetchFn: recorder.fetchFn,
  });
  let allPassed = true;

  for (const model of ownModelsFor(provider)) {
    recorder.reset();
    toolRuns = 0;

    const booked: [JarvisLiveBrain, JarvisTokenUsage][] = [];
    const session = buildLoop(provider, key).createSession();
    const turn = await runProbeTurn(session, model, createBookingMeter(booked));

    session.dispose();

    const failure = describeFailure(turn, toolRuns, recorder);

    if (failure !== null) {
      allPassed = false;
      print(`FAIL ${model.brain}: ${failure}`);
    } else {
      const costUsd = booked.reduce((sum, [brain, usage]) => {
        return sum + estimateUsageCostUsd(brain, usage);
      }, 0);

      print(
        `PASS ${model.brain}: ${booked.length} requests, booked $${costUsd.toFixed(6)}`,
      );
    }
  }

  return allPassed;
}

/** Checks the key where the server does, and prints what came back. */
async function checkKey(options: OwnKeyProbeOptions): Promise<boolean> {
  const { provider, key, print } = options;
  const url = OWN_KEY_ENDPOINTS[provider].url;
  let status: number | null = null;

  const verdict = await verifyOwnKey(
    provider,
    key,
    new AbortController().signal,
    async (input, init) => {
      const response = await options.fetchFn(input, init);
      status = response.status;

      return response;
    },
  );

  print(`key check: GET ${url} -> ${status ?? "no answer"} ${verdict}`);

  return verdict === "accepted";
}

/** Why a model's turn failed, or null when it passed. */
function describeFailure(
  turn: TurnRecord,
  toolRuns: number,
  recorder: RecordingFetch,
): string | null {
  const refusal = recorder.lastRefusal();

  if (refusal !== null) {
    return [
      `status ${refusal.status}`,
      ...(refusal.type === null ? [] : [`type ${refusal.type}`]),
      ...(refusal.code === null ? [] : [`code ${refusal.code}`]),
    ].join(", ");
  }

  if (turn.timedOut) {
    return `no end within ${PROBE_TURN_TIMEOUT_MS / 1_000} s`;
  }

  const error = turn.events.find((event) => {
    return event.type === "error";
  });

  if (error !== undefined && error.type === "error") {
    // The session's own copy, which never quotes the provider.
    return `the turn ended with an error: ${error.message}`;
  }

  if (toolRuns === 0) {
    return "the probe tool never ran";
  }

  const reply = turn.events
    .map((event) => {
      return event.type === "delta" ? event.text : "";
    })
    .join("");

  if (!reply.includes(PROBE_ANSWER)) {
    return "the reply did not carry the tool's answer back";
  }

  const reasoning = recorder.reasoningTokens();

  return reasoning > 0 ? `${reasoning} reasoning tokens` : null;
}

function createProbeTool(onRun: () => void): JarvisToolDefinition {
  return {
    name: PROBE_TOOL_NAME,
    description: "Returns the probe word. Call it once when asked.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    run: (): Promise<string> => {
      onRun();

      return Promise.resolve(PROBE_ANSWER);
    },
  };
}

function createBookingMeter(
  booked: [JarvisLiveBrain, JarvisTokenUsage][],
): TurnMeter {
  return {
    beginRequest: (): void => {},
    record: (brain: JarvisLiveBrain, usage: JarvisTokenUsage): void => {
      booked.push([brain, usage]);
    },
    endRequest: (): void => {},
    exhausted: (): boolean => {
      return false;
    },
  };
}

function runProbeTurn(
  session: AgentSession,
  model: JarvisOwnModel,
  meter: TurnMeter,
): Promise<TurnRecord> {
  return new Promise((resolve) => {
    const events: JarvisEvent[] = [];
    const subscription = session
      .runTurn(PROBE_PROMPT, [], { brain: model.brain, meter })
      .subscribe({
        next: (event: JarvisEvent): void => {
          events.push(event);
        },
        error: (): void => {
          clearTimeout(timer);
          resolve({
            events: [...events, { type: "error", message: "the turn threw" }],
            timedOut: false,
          });
        },
        complete: (): void => {
          clearTimeout(timer);
          resolve({ events, timedOut: false });
        },
      });

    const timer = setTimeout(() => {
      subscription.unsubscribe();
      resolve({ events, timedOut: true });
    }, PROBE_TURN_TIMEOUT_MS);
  });
}

/** Passes every request through, reading each turn request's reply whole so
 * the probe can see what the session does not keep: a refusal's status and
 * error type, and the reasoning tokens a reply reported. */
function createRecordingFetch(fetchFn: typeof fetch): RecordingFetch {
  let refusal: RefusedRequest | null = null;
  let reasoning = 0;

  async function recordRequest(
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ): Promise<Response> {
    const response = await fetchFn(input, init);
    const text = await response.text();

    if (response.ok) {
      reasoning += reasoningTokensIn(text);
    } else {
      refusal = refusalOf(response.status, text);
    }

    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  return {
    fetchFn: recordRequest,
    lastRefusal: (): RefusedRequest | null => {
      return refusal;
    },
    reasoningTokens: (): number => {
      return reasoning;
    },
    reset: (): void => {
      refusal = null;
      reasoning = 0;
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

/** The status, and the error's `type` and `code` if the body is the JSON
 * error object OpenAI, OpenRouter and Anthropic all send. */
function refusalOf(status: number, text: string): RefusedRequest {
  let error: Record<string, unknown> = {};

  try {
    const body: unknown = JSON.parse(text.slice(0, ERROR_BODY_MAX_CHARS));

    if (isRecord(body) && isRecord(body.error)) {
      error = body.error;
    }
  } catch {
    // Not JSON: the status alone.
  }

  return { status, type: textOf(error.type), code: textOf(error.code) };
}

/** The reasoning tokens a streamed chat-completions reply reported in its
 * usage chunks (`usage.completion_tokens_details.reasoning_tokens`). */
function reasoningTokensIn(text: string): number {
  let total = 0;

  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) {
      continue;
    }

    try {
      const chunk: unknown = JSON.parse(line.slice("data:".length));
      const usage = isRecord(chunk) ? chunk.usage : undefined;
      const details = isRecord(usage)
        ? usage.completion_tokens_details
        : undefined;
      const tokens = isRecord(details) ? details.reasoning_tokens : undefined;

      total += typeof tokens === "number" && tokens > 0 ? tokens : 0;
    } catch {
      // `[DONE]` and anything else that is not JSON.
    }
  }

  return total;
}
