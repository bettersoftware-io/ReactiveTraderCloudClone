import { vi } from "vitest";

/** One request the fake provider received. */
interface ProviderRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  /** The parsed JSON body; null for a GET. */
  readonly body: ChatBodyFixture | null;
}

interface ChatBodyFixture {
  readonly model: string;
  readonly messages: readonly ChatMessageFixture[];
  readonly tools?: readonly { readonly function: { readonly name: string } }[];
  readonly [field: string]: unknown;
}

interface ChatMessageFixture {
  readonly role: string;
  readonly content: string | null;
}

export interface FakeChatProviderOptions {
  /** The tool the fake model calls on a request that has not yet seen a
   * tool result. */
  readonly toolName: string;
  /** Every chat request is answered with this status and body instead. */
  readonly failWith?: { readonly status: number; readonly body: unknown };
  /** `usage.cost` on every reply to a request that asks for it with
   * `usage: { include: true }`, as OpenRouter did before it reported cost
   * on every reply; none by default. */
  readonly reportedCostUsd?: number;
  /** `usage.completion_tokens_details.reasoning_tokens` on every reply. */
  readonly reasoningTokens?: number;
  /** Status of the key check (any GET); 200 by default. */
  readonly keyCheckStatus?: number;
}

export interface FakeChatProvider {
  readonly fetchFn: typeof fetch;
  readonly requests: ProviderRequest[];
}

/** Tokens every fake reply reports. */
export const FAKE_PROMPT_TOKENS = 1_000;
export const FAKE_COMPLETION_TOKENS = 200;

/**
 * A provider speaking the OpenAI chat-completions dialect, streamed: a
 * request with no tool result yet calls `toolName`; one that carries a tool
 * result answers with that result as its text, so a test can see the result
 * went back. A GET is a key check.
 */
export function createFakeChatProvider(
  options: FakeChatProviderOptions,
): FakeChatProvider {
  const requests: ProviderRequest[] = [];
  const fetchFn = vi.fn<typeof fetch>((input, init) => {
    const request = seeProviderRequest(input, init);
    requests.push(request);

    if (request.body === null) {
      return Promise.resolve(
        new Response("{}", { status: options.keyCheckStatus ?? 200 }),
      );
    }

    if (options.failWith !== undefined) {
      return Promise.resolve(
        new Response(JSON.stringify(options.failWith.body), {
          status: options.failWith.status,
          headers: { "content-type": "application/json" },
        }),
      );
    }

    const toolResult = request.body.messages.find((message) => {
      return message.role === "tool";
    });

    const usage = createUsageChunkFixture(
      options,
      isRecord(request.body.usage) && request.body.usage.include === true,
    );

    const chunks =
      toolResult === undefined
        ? [
            createToolCallChunkFixture("call_probe", options.toolName, "{}"),
            createFinishChunkFixture("tool_calls"),
            usage,
          ]
        : [
            createTextChunkFixture(`Done: ${toolResult.content ?? ""}`),
            createFinishChunkFixture("stop"),
            usage,
          ];

    return Promise.resolve(
      new Response(encodeSseFixture(chunks), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
  });

  return { fetchFn, requests };
}

function seeProviderRequest(
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
): ProviderRequest {
  const url = input instanceof Request ? input.url : String(input);
  const method = init?.method ?? "GET";
  const body =
    typeof init?.body === "string"
      ? (JSON.parse(init.body) as ChatBodyFixture)
      : null;

  return { url, method, headers: new Headers(init?.headers), body };
}

function encodeSseFixture(chunks: readonly unknown[]): string {
  return `${chunks
    .map((chunk) => {
      return `data: ${JSON.stringify(chunk)}\n\n`;
    })
    .join("")}data: [DONE]\n\n`;
}

function createTextChunkFixture(text: string): unknown {
  return {
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  };
}

function createFinishChunkFixture(reason: string): unknown {
  return { choices: [{ index: 0, delta: {}, finish_reason: reason }] };
}

function createToolCallChunkFixture(
  id: string,
  name: string,
  args: string,
): unknown {
  return {
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id,
              type: "function",
              function: { name, arguments: args },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createUsageChunkFixture(
  options: FakeChatProviderOptions,
  costAskedFor: boolean,
): unknown {
  return {
    choices: [],
    usage: {
      prompt_tokens: FAKE_PROMPT_TOKENS,
      completion_tokens: FAKE_COMPLETION_TOKENS,
      total_tokens: FAKE_PROMPT_TOKENS + FAKE_COMPLETION_TOKENS,
      ...(options.reportedCostUsd === undefined || !costAskedFor
        ? {}
        : { cost: options.reportedCostUsd }),
      ...(options.reasoningTokens === undefined
        ? {}
        : {
            completion_tokens_details: {
              reasoning_tokens: options.reasoningTokens,
            },
          }),
    },
  };
}
