import { Observable } from "rxjs";

import type { ConfirmGate, JarvisToolDefinition } from "@rtc/agent-tools";
import {
  type JarvisEvent,
  type JarvisHistoryEntry,
  type JarvisLiveBrain,
  ownModelOf,
} from "@rtc/domain";

import type { TurnMeter } from "../services/jarvisBudget/JarvisBudgetService.js";
import type { JarvisTokenUsage } from "../services/UsageMeter.js";
import {
  type AgentSession,
  describeRefusedKey,
  describeSdkErrorForLogging,
  type JarvisTurnOptions,
} from "./agentLoop.js";
import { JARVIS_SYSTEM_PROMPT } from "./jarvisPersona.js";
import {
  JARVIS_MAX_TOKENS_PER_TURN,
  JARVIS_MAX_TURNS_PER_SESSION,
} from "./jarvisRunnerConfig.js";
import {
  BUDGET_SPENT_NOTICE,
  BUDGET_STOP_NOTICE,
  CANCELLED_MESSAGE,
  CHARS_PER_TOKEN_ESTIMATE,
  DESK_LINK_FALTERED_MESSAGE,
  friendlyToolName,
  JARVIS_RUNNER_MAX_ITERATIONS,
  REFUSAL_MESSAGE,
  RUNWAY_EXHAUSTED_NOTICE,
  SESSION_CAP_MESSAGE,
  TRUNCATION_NOTICE,
} from "./jarvisTurnCopy.js";
import { LiveSessionDesk } from "./LiveSessionDesk.js";
import {
  capMessages,
  type HistoryMessage,
  historyMessageOf,
  isBudgetSpent,
  KEY_REFUSAL_STATUSES,
  REQUEST_CEILING,
  recordSafely,
} from "./liveSessionRules.js";
import { parseSseChunks } from "./openAiSse.js";

/** Names this session in its log lines. */
const SESSION_NAME = "OpenAiCompatibleAgentSession";

/**
 * Where a session's requests go and how they are shaped: what
 * `OpenAiCompatibleAgentLoop` makes of its config and the connection's key.
 * `headers` already carry the key; nothing here is read from the
 * environment.
 */
export interface OpenAiCompatibleEndpoint {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly tokenLimitParam: "max_tokens" | "max_completion_tokens";
  readonly extraBody: Readonly<Record<string, unknown>>;
  readonly fetchFn: typeof fetch;
}

interface ChatToolCall {
  readonly id: string;
  readonly type: "function";
  readonly function: { readonly name: string; readonly arguments: string };
}

type ChatMessage =
  | { readonly role: "system" | "user"; readonly content: string }
  | {
      readonly role: "assistant";
      readonly content: string | null;
      readonly tool_calls?: readonly ChatToolCall[];
    }
  | {
      readonly role: "tool";
      readonly tool_call_id: string;
      readonly content: string;
    };

interface ChatTool {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Readonly<Record<string, unknown>>;
  };
}

/** One tool call as its deltas arrive: the id and name once, the arguments
 * as string fragments. */
interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
  /** Its `running` tool event has been pushed. */
  announced: boolean;
}

/** One request's streamed reply, read to its end. */
interface StreamedReply {
  readonly kind: "reply";
  readonly text: string;
  readonly toolCalls: readonly PendingToolCall[];
  readonly finishReason: string;
  /** Null when the provider sent none. */
  readonly usage: JarvisTokenUsage | null;
}

/** What one request came to. Everything but a reply fails the turn. */
type RequestOutcome =
  | StreamedReply
  | {
      readonly kind: "httpError";
      readonly status: number;
      /** OpenAI's 429 for a key out of credit. */
      readonly outOfCredit: boolean;
    }
  | { readonly kind: "streamError" }
  | { readonly kind: "unfinished" };

type TurnOutcome =
  | { readonly kind: "completed"; readonly finalText: string }
  | { readonly kind: "refused" | "aborted" | "errored" };

type Push = (event: JarvisEvent) => void;

function toChatTool(tool: JarvisToolDefinition): ChatTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function countOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

/**
 * A request's usage as the provider reported it. `prompt_tokens` counts
 * cached input too, and the whole of it is booked as fresh input: providers
 * discount cached input by different amounts, so this errs high rather than
 * guessing a discount. A `cost` (OpenRouter's, once asked for) is booked as
 * the request's cost.
 */
function usageOf(usage: Record<string, unknown>): JarvisTokenUsage {
  return {
    inputTokens: countOf(usage.prompt_tokens),
    outputTokens: countOf(usage.completion_tokens),
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    ...(typeof usage.cost === "number" ? { reportedCostUsd: usage.cost } : {}),
  };
}

/** Whether a 429's body says the key is out of credit (D13): OpenAI's
 * `insufficient_quota`, in the error's `type` or `code`. The body is read
 * for this one test and goes nowhere else. */
async function readsOutOfCredit(response: Response): Promise<boolean> {
  try {
    const body: unknown = await response.json();
    const error = isRecord(body) && isRecord(body.error) ? body.error : {};

    return (
      error.type === "insufficient_quota" || error.code === "insufficient_quota"
    );
  } catch {
    return false;
  }
}

/** Whether a reply asks for its tool calls to be run. Some providers end a
 * tool-calling reply with `stop` rather than `tool_calls`. */
function asksForTools(reply: StreamedReply): boolean {
  return (
    reply.toolCalls.length > 0 &&
    (reply.finishReason === "tool_calls" || reply.finishReason === "stop")
  );
}

function assistantMessageOf(reply: StreamedReply): ChatMessage {
  return {
    role: "assistant",
    content: reply.text === "" ? null : reply.text,
    tool_calls: reply.toolCalls.map((call): ChatToolCall => {
      return {
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      };
    }),
  };
}

/**
 * One turn's requests, as its budget sees them (spec §3.3 steps 4–5): every
 * request is reserved before it is made and booked after, and one that never
 * finishes is still booked with what it used, at an estimate — the provider
 * reports usage only in the stream's last chunk, so a request cut short has
 * reported nothing. Without a meter every call is a no-op.
 */
interface RequestLedger {
  /** Before a request: false when the budget is spent, with nothing
   * reserved; otherwise reserves the request's worst case. */
  beginRequest(): boolean;
  /** Just before the request goes out, with its body's length: a request
   * made on an aborted signal never goes out. */
  markRequestSent(bodyChars: number): void;
  /** The provider has begun streaming its reply. */
  noteGenerating(): void;
  /** Characters of generated content (text, tool-call arguments). */
  noteStreamed(chars: number): void;
  /** Books a request whose stream ended: what it reported, or an estimate
   * when it reported nothing. */
  bookRequest(usage: JarvisTokenUsage | null): void;
  /**
   * Once the turn is over, however it ended. A request never sent is
   * released. A cancelled request is booked at an estimate — the provider
   * bills from the moment it has the request, and a client could otherwise
   * loop chat and cancel for nothing. A request that failed after its reply
   * began streaming is booked at an estimate too; one that failed before
   * (an error status, a refused connection) is released: the provider never
   * generated anything for it.
   */
  settle(): void;
}

function createRequestLedger(
  meter: TurnMeter | undefined,
  brain: JarvisLiveBrain,
  signal: AbortSignal,
): RequestLedger {
  if (meter === undefined) {
    return {
      beginRequest: (): boolean => {
        return true;
      },
      markRequestSent: (): void => {},
      noteGenerating: (): void => {},
      noteStreamed: (): void => {},
      bookRequest: (): void => {},
      settle: (): void => {},
    };
  }

  const liveMeter: TurnMeter = meter;
  // A request has been reserved and not yet booked or released.
  let open = false;
  let sent = false;
  let generating = false;
  let bodyChars = 0;
  let streamedChars = 0;

  function book(usage: JarvisTokenUsage): void {
    open = false;
    recordSafely(liveMeter, brain, usage, SESSION_NAME);
  }

  /** The open request at ~4 characters a token: its body as sent (the
   * persona, the tools and the conversation) as input, what streamed as
   * output. */
  function estimate(): JarvisTokenUsage {
    return {
      inputTokens: Math.ceil(bodyChars / CHARS_PER_TOKEN_ESTIMATE),
      outputTokens: Math.ceil(streamedChars / CHARS_PER_TOKEN_ESTIMATE),
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
  }

  return {
    beginRequest: (): boolean => {
      if (isBudgetSpent(liveMeter, SESSION_NAME)) {
        return false;
      }

      liveMeter.beginRequest(brain, REQUEST_CEILING);
      open = true;
      sent = false;
      generating = false;
      bodyChars = 0;
      streamedChars = 0;

      return true;
    },
    markRequestSent: (chars: number): void => {
      if (open && !signal.aborted) {
        sent = true;
        bodyChars = chars;
      }
    },
    noteGenerating: (): void => {
      generating = true;
    },
    noteStreamed: (chars: number): void => {
      streamedChars += chars;
    },
    bookRequest: (usage: JarvisTokenUsage | null): void => {
      if (open) {
        book(usage ?? estimate());
      }
    },
    settle: (): void => {
      if (!open) {
        return;
      }

      if (sent && (signal.aborted || generating)) {
        book(estimate());

        return;
      }

      open = false;
      liveMeter.endRequest();
    },
  };
}

/** Folds one `delta.tool_calls` entry into the call it continues, keyed by
 * `index`, and announces the call once its name is known. */
function foldToolCallDelta(
  calls: Map<number, PendingToolCall>,
  fragment: unknown,
  position: number,
  push: Push,
  requests: RequestLedger,
): void {
  if (!isRecord(fragment)) {
    return;
  }

  const index = typeof fragment.index === "number" ? fragment.index : position;
  let call = calls.get(index);

  if (call === undefined) {
    call = { id: "", name: "", arguments: "", announced: false };
    calls.set(index, call);
  }

  if (typeof fragment.id === "string" && call.id === "") {
    call.id = fragment.id;
  }

  const fn = isRecord(fragment.function) ? fragment.function : {};

  if (typeof fn.name === "string" && call.name === "") {
    call.name = fn.name;
  }

  if (typeof fn.arguments === "string") {
    call.arguments += fn.arguments;
    requests.noteStreamed(fn.arguments.length);
  }

  if (!call.announced && call.name !== "") {
    call.announced = true;
    push({
      type: "toolEvent",
      tool: friendlyToolName(call.name),
      status: "running",
    });
  }
}

/** Reads one request's stream to its end, relaying text as it arrives. */
async function readReply(
  chunks: AsyncIterable<unknown>,
  push: Push,
  requests: RequestLedger,
): Promise<RequestOutcome> {
  let text = "";
  let finishReason: string | null = null;
  let usage: JarvisTokenUsage | null = null;
  const calls = new Map<number, PendingToolCall>();

  for await (const chunk of chunks) {
    if (!isRecord(chunk)) {
      continue;
    }

    // A provider failing mid-stream sends an error object in place of a
    // chunk. Its content is never read.
    if (chunk.error !== undefined && chunk.error !== null) {
      return { kind: "streamError" };
    }

    if (isRecord(chunk.usage)) {
      usage = usageOf(chunk.usage);
    }

    const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;

    if (!isRecord(choice)) {
      continue;
    }

    requests.noteGenerating();

    const delta = isRecord(choice.delta) ? choice.delta : {};

    if (typeof delta.content === "string" && delta.content !== "") {
      text += delta.content;
      requests.noteStreamed(delta.content.length);
      push({ type: "delta", text: delta.content });
    }

    if (Array.isArray(delta.tool_calls)) {
      delta.tool_calls.forEach((fragment: unknown, position: number) => {
        foldToolCallDelta(calls, fragment, position, push, requests);
      });
    }

    if (typeof choice.finish_reason === "string") {
      finishReason = choice.finish_reason;
    }
  }

  if (finishReason === null) {
    return { kind: "unfinished" };
  }

  // OpenRouter's finish reason for a provider that failed mid-stream.
  if (finishReason === "error") {
    return { kind: "streamError" };
  }

  const toolCalls = [...calls.entries()]
    .sort(([a], [b]) => {
      return a - b;
    })
    .map(([index, call]): PendingToolCall => {
      if (call.id === "") {
        call.id = `call_${index}`;
      }

      return call;
    });

  for (const call of toolCalls) {
    if (call.announced) {
      push({
        type: "toolEvent",
        tool: friendlyToolName(call.name),
        status: "done",
      });
    }
  }

  return { kind: "reply", text, toolCalls, finishReason, usage };
}

/** What a failed request is logged as: its status, or what went wrong with
 * its stream. Never a body. */
function describeOutcomeForLogging(
  outcome: Exclude<RequestOutcome, StreamedReply>,
): string {
  switch (outcome.kind) {
    case "httpError":
      return `status ${outcome.status}`;
    case "streamError":
      return "the stream carried an error";
    case "unfinished":
      return "the stream ended without a finish reason";
  }
}

/**
 * One connection's conversation with an OpenAI-compatible chat-completions
 * endpoint (OpenRouter, OpenAI), over plain `fetch`: no SDK. It behaves like
 * `AnthropicAgentSession` in everything a person sees — the same copy, the
 * same tools through its own `LiveSessionDesk`, the same budget checks and
 * session limits — and runs the tool loop itself, since there is no SDK
 * runner to run it.
 */
export class OpenAiCompatibleAgentSession implements AgentSession {
  private readonly desk: LiveSessionDesk;

  private readonly tools: readonly ChatTool[];

  private history: HistoryMessage[] = [];

  private turnCount = 0;

  private currentAbort: AbortController | null = null;

  constructor(
    private readonly endpoint: OpenAiCompatibleEndpoint,
    buildTools: (confirmTrade: ConfirmGate) => readonly JarvisToolDefinition[],
    knownSymbols: readonly string[],
  ) {
    this.desk = new LiveSessionDesk(buildTools, knownSymbols);
    this.tools = this.desk.tools.map(toChatTool);
  }

  resolveConfirmation(confirmationId: string, approved: boolean): void {
    this.desk.resolveConfirmation(confirmationId, approved);
  }

  runTurn(
    text: string,
    history: readonly JarvisHistoryEntry[],
    options?: JarvisTurnOptions,
  ): Observable<JarvisEvent> {
    return new Observable<JarvisEvent>((subscriber) => {
      let closed = false;

      function push(event: JarvisEvent): void {
        if (!closed) {
          subscriber.next(event);
        }
      }

      function complete(): void {
        if (!closed) {
          closed = true;
          subscriber.complete();
        }
      }

      this.turnCount += 1;

      if (this.turnCount > JARVIS_MAX_TURNS_PER_SESSION) {
        push({ type: "error", message: SESSION_CAP_MESSAGE });
        complete();

        return undefined;
      }

      // Seeded from the wire once, on the first turn; after that the
      // session's own copy grows (see `AnthropicAgentSession.runTurn`).
      if (this.history.length === 0 && history.length > 0) {
        this.history = capMessages(history.map(historyMessageOf));
      }

      const userMessage: HistoryMessage = { role: "user", content: text };
      const controller = new AbortController();
      this.currentAbort = controller;
      this.desk.bindTurn({ push, signal: controller.signal });

      // `runOneTurn` never rejects: every failure becomes a pushed event.
      void this.runOneTurn(
        [...this.history, userMessage],
        controller.signal,
        push,
        options,
      )
        .then((outcome) => {
          if (outcome.kind === "completed") {
            this.history = capMessages([
              ...this.history,
              userMessage,
              { role: "assistant", content: outcome.finalText },
            ]);
          }
        })
        .finally(() => {
          this.currentAbort = null;
          this.desk.bindTurn(null);
          complete();
        });

      return (): void => {
        closed = true;
        controller.abort();
        this.desk.releasePendingConfirmations();
      };
    });
  }

  /**
   * Runs one turn's tool loop: a request, its tools, the next request, until
   * the model ends its reply, the iteration cap or the budget cuts it off,
   * or it fails. Mirrors the Anthropic SDK runner it stands in for: the
   * budget is asked before every request, so a reply whose next request it
   * stops never runs its tools; the tools of the last allowed request do run,
   * and the runway notice follows.
   */
  private async runOneTurn(
    turnMessages: readonly HistoryMessage[],
    signal: AbortSignal,
    push: Push,
    options: JarvisTurnOptions | undefined,
  ): Promise<TurnOutcome> {
    const brain = options?.brain;
    const model = brain === undefined ? undefined : ownModelOf(brain)?.modelId;

    // Routing sends only a listed own brain here (its cost must be
    // meterable); anything else fails closed, before any request.
    if (brain === undefined || model === undefined) {
      console.error(`${SESSION_NAME}: the turn's brain is not a listed model`);
      push({ type: "error", message: DESK_LINK_FALTERED_MESSAGE });

      return { kind: "errored" };
    }

    const requests = createRequestLedger(options?.meter, brain, signal);
    const conversation: ChatMessage[] = [
      { role: "system", content: JARVIS_SYSTEM_PROMPT },
      ...turnMessages,
    ];
    let finalText = "";

    try {
      // A turn routed while the budget lasted can find it spent by now.
      if (!requests.beginRequest()) {
        push({ type: "delta", text: BUDGET_SPENT_NOTICE });
        push({ type: "done" });

        return { kind: "completed", finalText: BUDGET_SPENT_NOTICE };
      }

      for (let iteration = 1; ; iteration += 1) {
        const outcome = await this.requestReply(
          model,
          conversation,
          signal,
          push,
          requests,
        );

        if (outcome.kind !== "reply") {
          return this.failTurn(outcome, push, options);
        }

        requests.bookRequest(outcome.usage);
        finalText += outcome.text;

        if (outcome.finishReason === "content_filter") {
          push({ type: "error", message: REFUSAL_MESSAGE });

          return { kind: "refused" };
        }

        if (outcome.finishReason === "length") {
          finalText += TRUNCATION_NOTICE;
          push({ type: "delta", text: TRUNCATION_NOTICE });
          push({ type: "done" });

          return { kind: "completed", finalText };
        }

        if (!asksForTools(outcome)) {
          push({ type: "done" });

          return { kind: "completed", finalText };
        }

        // The budget check before the next request (spec §3.3 step 4),
        // which also reserves it. A reservation for a request the cap below
        // then never sends is released by `settle`.
        if (!requests.beginRequest()) {
          finalText += BUDGET_STOP_NOTICE;
          push({ type: "delta", text: BUDGET_STOP_NOTICE });
          push({ type: "done" });

          return { kind: "completed", finalText };
        }

        signal.throwIfAborted();
        conversation.push(assistantMessageOf(outcome));
        conversation.push(...(await this.runToolCalls(outcome.toolCalls)));

        if (iteration >= JARVIS_RUNNER_MAX_ITERATIONS) {
          finalText += RUNWAY_EXHAUSTED_NOTICE;
          push({ type: "delta", text: RUNWAY_EXHAUSTED_NOTICE });
          push({ type: "done" });

          return { kind: "completed", finalText };
        }

        signal.throwIfAborted();
      }
    } catch (error) {
      if (signal.aborted) {
        push({ type: "error", message: CANCELLED_MESSAGE });

        return { kind: "aborted" };
      }

      // The error's name only (a network `TypeError`, say), never its
      // message, which can quote the request or the response.
      console.error(
        `${SESSION_NAME}: turn failed —`,
        describeSdkErrorForLogging(error),
      );
      push({ type: "error", message: DESK_LINK_FALTERED_MESSAGE });

      return { kind: "errored" };
    } finally {
      requests.settle();
    }
  }

  /** Makes one streaming request and reads its reply. */
  private async requestReply(
    model: string,
    conversation: readonly ChatMessage[],
    signal: AbortSignal,
    push: Push,
    requests: RequestLedger,
  ): Promise<RequestOutcome> {
    const { url, headers, tokenLimitParam, extraBody, fetchFn } = this.endpoint;
    // Extra fields first, so none can replace the request's own.
    const body = JSON.stringify({
      ...extraBody,
      model,
      messages: conversation,
      tools: this.tools,
      stream: true,
      stream_options: { include_usage: true },
      [tokenLimitParam]: JARVIS_MAX_TOKENS_PER_TURN,
    });

    requests.markRequestSent(body.length);

    const response = await fetchFn(url, {
      method: "POST",
      headers,
      body,
      redirect: "error",
      signal,
    });

    if (!response.ok) {
      const outOfCredit =
        response.status === 429 && (await readsOutOfCredit(response));

      if (response.status !== 429) {
        response.body?.cancel().catch(() => {});
      }

      return { kind: "httpError", status: response.status, outOfCredit };
    }

    if (response.body === null) {
      return { kind: "unfinished" };
    }

    return readReply(parseSseChunks(response.body, signal), push, requests);
  }

  /** Ends a turn on a failed request. On a person's own key the provider's
   * refusal is theirs to act on (D13): the turn says so, and the key reads
   * refused from here on. It never falls back to another key. */
  private failTurn(
    outcome: Exclude<RequestOutcome, StreamedReply>,
    push: Push,
    options: JarvisTurnOptions | undefined,
  ): TurnOutcome {
    console.error(
      `${SESSION_NAME}: turn failed —`,
      describeOutcomeForLogging(outcome),
    );

    const refusesKey =
      outcome.kind === "httpError" &&
      (KEY_REFUSAL_STATUSES.has(outcome.status) ||
        (outcome.status === 429 && outcome.outOfCredit));

    if (options?.keyFailure !== undefined && refusesKey) {
      push({
        type: "error",
        message: describeRefusedKey(options.keyFailure.providerName),
      });
      options.keyFailure.refused();

      return { kind: "errored" };
    }

    push({ type: "error", message: DESK_LINK_FALTERED_MESSAGE });

    return { kind: "errored" };
  }

  /** Runs a reply's tool calls, all at once as the Anthropic SDK runner
   * does, and answers each with a `tool` message in call order. */
  private runToolCalls(
    calls: readonly PendingToolCall[],
  ): Promise<ChatMessage[]> {
    return Promise.all(
      calls.map(async (call): Promise<ChatMessage> => {
        return {
          role: "tool",
          tool_call_id: call.id,
          content: await this.runToolCall(call),
        };
      }),
    );
  }

  /** One call's result. A failure goes back to the model as an `Error:`
   * result, worded as the Anthropic SDK runner words it, and never fails the
   * turn. */
  private async runToolCall(call: PendingToolCall): Promise<string> {
    const tool = this.desk.tools.find((candidate) => {
      return candidate.name === call.name;
    });

    if (tool === undefined) {
      return `Error: Tool '${call.name}' not found`;
    }

    let input: unknown;

    try {
      input = call.arguments.trim() === "" ? {} : JSON.parse(call.arguments);
    } catch {
      return "Error: the arguments were not valid JSON, so the tool did not run.";
    }

    try {
      return await tool.run(input);
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  cancelTurn(): void {
    this.currentAbort?.abort();
    this.desk.releasePendingConfirmations();
  }

  dispose(): void {
    this.cancelTurn();
  }
}
