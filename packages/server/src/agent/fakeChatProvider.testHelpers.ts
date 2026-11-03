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

/**
 * Anthropic's Messages API, streamed, where every request first fails once
 * with a 529 (overloaded) that asks for an immediate retry: the SDK's own
 * retry then gets the real answer. A request with no tool result yet calls
 * `toolName`; one with a tool result answers with it.
 */
export function createFakeAnthropicProviderFailingOnce(
  toolName: string,
  /** Answers a request carrying a tool result with a stream that errs. */
  breaksAfterTool = false,
): FakeChatProvider {
  const requests: ProviderRequest[] = [];
  const seenBodies = new Set<string>();
  const fetchFn = vi.fn<typeof fetch>((input, init) => {
    const request = seeProviderRequest(input, init);
    requests.push(request);

    if (typeof init?.body !== "string") {
      return Promise.resolve(new Response("{}", { status: 200 }));
    }

    if (!seenBodies.has(init.body)) {
      seenBodies.add(init.body);

      return Promise.resolve(
        new Response(JSON.stringify(createOverloadedErrorFixture()), {
          status: 529,
          headers: {
            "content-type": "application/json",
            // The SDK waits what this says (a zero falls back to its own
            // half-second backoff), so the retry follows at once.
            "retry-after-ms": "1",
            "x-should-retry": "true",
          },
        }),
      );
    }

    const toolResult = toolResultIn(init.body);
    const events =
      toolResult === null
        ? createAnthropicToolUseEventsFixture(toolName)
        : breaksAfterTool
          ? createAnthropicStreamErrorEventsFixture()
          : createAnthropicTextEventsFixture(`Done: ${toolResult}`);

    return Promise.resolve(
      new Response(encodeAnthropicSseFixture(events), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
  });

  return { fetchFn, requests };
}

/** The text of the last tool result a Messages request carries, or null. */
function toolResultIn(body: string): string | null {
  const parsed: unknown = JSON.parse(body);
  const messages =
    isRecord(parsed) && Array.isArray(parsed.messages) ? parsed.messages : [];
  let found: string | null = null;

  for (const message of messages) {
    const content =
      isRecord(message) && Array.isArray(message.content)
        ? message.content
        : [];

    for (const block of content) {
      if (isRecord(block) && block.type === "tool_result") {
        found = textOfToolResult(block.content);
      }
    }
  }

  return found;
}

function textOfToolResult(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  return Array.isArray(content)
    ? content
        .map((part: unknown) => {
          return isRecord(part) && typeof part.text === "string"
            ? part.text
            : "";
        })
        .join("")
    : "";
}

function createOverloadedErrorFixture(): unknown {
  return {
    type: "error",
    error: { type: "overloaded_error", message: "Overloaded" },
  };
}

function createAnthropicMessageStartFixture(): unknown {
  return {
    type: "message_start",
    message: {
      id: "msg_probe",
      type: "message",
      role: "assistant",
      content: [],
      model: "claude-test",
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: FAKE_PROMPT_TOKENS, output_tokens: 1 },
    },
  };
}

function createAnthropicToolUseEventsFixture(toolName: string): unknown[] {
  return [
    createAnthropicMessageStartFixture(),
    {
      type: "content_block_start",
      index: 0,
      content_block: {
        type: "tool_use",
        id: "toolu_probe",
        name: toolName,
        input: {},
      },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: "{}" },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: "tool_use", stop_sequence: null },
      usage: { output_tokens: FAKE_COMPLETION_TOKENS },
    },
    { type: "message_stop" },
  ];
}

function createAnthropicTextEventsFixture(text: string): unknown[] {
  return [
    createAnthropicMessageStartFixture(),
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: FAKE_COMPLETION_TOKENS },
    },
    { type: "message_stop" },
  ];
}

/** A stream that starts, then carries Anthropic's mid-stream error event. */
function createAnthropicStreamErrorEventsFixture(): unknown[] {
  return [
    createAnthropicMessageStartFixture(),
    {
      type: "error",
      error: { type: "api_error", message: "Internal server error" },
    },
  ];
}

function encodeAnthropicSseFixture(events: readonly unknown[]): string {
  return events
    .map((event) => {
      const type =
        isRecord(event) && typeof event.type === "string" ? event.type : "";

      return `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
    })
    .join("");
}
