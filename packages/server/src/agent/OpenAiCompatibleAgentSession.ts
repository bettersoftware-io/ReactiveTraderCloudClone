import { Observable } from "rxjs";

import type { ConfirmGate, JarvisToolDefinition } from "@rtc/agent-tools";
import {
  type JarvisEvent,
  type JarvisHistoryEntry,
  type JarvisLiveBrain,
  type JarvisOwnModel,
  ownModelOf,
} from "@rtc/domain";

import type { TurnMeter } from "../services/jarvisBudget/JarvisBudgetService.js";
import {
  estimateListedCostUsd,
  type JarvisTokenUsage,
} from "../services/UsageMeter.js";
import {
  type AgentSession,
  describeRefusedKey,
  describeSdkErrorForLogging,
  type JarvisTurnOptions,
} from "./agentLoop.js";
import { JARVIS_SYSTEM_PROMPT } from "./jarvisPersona.js";
import {
  JARVIS_MAX_TOKENS_PER_TURN,
  JARVIS_MAX_TOOL_CALLS_PER_REPLY,
  JARVIS_MAX_TURNS_PER_SESSION,
  JARVIS_RESPONSE_TIMEOUT_MS,
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

/** A reported cost is booked at no more than this many of the request's
 * listed worst case. Clamped rather than dropped: a cost above the list may
 * be real (OpenRouter can route to a dearer provider), so the budget keeps
 * the high figure, but a provider bug cannot book an absurd one, and two of
 * them cannot add up to Infinity. */
const REPORTED_COST_CEILINGS = 4;

/** How much of a 429's or a 403's body is read to tell a key out of credit,
 * or input flagged by moderation, apart: an error object is a few hundred
 * bytes. A longer body is not read on, and says neither. */
const ERROR_BODY_MAX_BYTES = 4 * 1024;

/** The most generated characters (text and tool-call arguments) one reply
 * may stream: four times what the turn's token limit makes at the estimate.
 * A provider streaming past it is broken or hostile; the request fails. */
const REPLY_MAX_CHARS: number =
  4 * JARVIS_MAX_TOKENS_PER_TURN * CHARS_PER_TOKEN_ESTIMATE;

/** The most distinct tool calls one reply may announce, each with its own
 * `toolEvent` frame: a small multiple of the calls a reply may run. Past it
 * the request fails before another frame goes out. */
const REPLY_MAX_TOOL_CALLS: number = 4 * JARVIS_MAX_TOOL_CALLS_PER_REPLY;

/** What a call that named no tool is sent back under: the API takes no
 * empty name. */
const NAMELESS_TOOL_NAME = "unnamed_tool";

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
  /** Extra fields that depend on the model (OpenRouter's price ceiling). */
  readonly modelBody: (
    model: JarvisOwnModel,
  ) => Readonly<Record<string, unknown>>;
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
      /** OpenRouter's 403 for input its moderation flagged: the key is
       * fine. */
      readonly moderated: boolean;
    }
  | { readonly kind: "streamError" }
  | { readonly kind: "unfinished" };

type TurnOutcome =
  | { readonly kind: "completed"; readonly finalText: string }
  | { readonly kind: "refused" | "aborted" | "errored" };

type Push = (event: JarvisEvent) => void;

/** What one request of a turn needs from the turn. */
interface RequestTurn {
  readonly brain: JarvisLiveBrain;
  readonly signal: AbortSignal;
  readonly push: Push;
  readonly requests: RequestLedger;
  readonly maxReportedCostUsd: number;
}

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
 * guessing a discount.
 *
 * A `cost` (OpenRouter's) is booked as the request's cost, with
 * `cost_details.upstream_inference_cost` added: on a key the person keeps
 * at OpenRouter for another provider (BYOK), `cost` is OpenRouter's fee
 * alone and the provider's charge is the upstream cost. The booked cost is
 * never below the listed price for the same usage, so a reported cost that
 * leaves the charge out cannot let a turn run free, and never above
 * `maxReportedCostUsd` (see `REPORTED_COST_CEILINGS`).
 */
function usageOf(
  usage: Record<string, unknown>,
  brain: JarvisLiveBrain,
  maxReportedCostUsd: number,
): JarvisTokenUsage {
  const tokens: JarvisTokenUsage = {
    inputTokens: countOf(usage.prompt_tokens),
    outputTokens: countOf(usage.completion_tokens),
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };

  if (typeof usage.cost !== "number") {
    return tokens;
  }

  const details = isRecord(usage.cost_details) ? usage.cost_details : {};
  const reportedUsd =
    countOf(usage.cost) + countOf(details.upstream_inference_cost);
  const listedUsd = estimateListedCostUsd(brain, tokens);

  return {
    ...tokens,
    reportedCostUsd: Math.min(
      Math.max(reportedUsd, listedUsd),
      maxReportedCostUsd,
    ),
  };
}

/** The `error` object of a failed request's JSON body, read up to
 * `ERROR_BODY_MAX_BYTES`; empty when there is none. It is read only to tell
 * kinds of failure apart and goes nowhere else. */
async function readErrorObject(
  response: Response,
): Promise<Record<string, unknown>> {
  const text = await readBodyUpTo(response.body, ERROR_BODY_MAX_BYTES);

  if (text === null) {
    return {};
  }

  try {
    const body: unknown = JSON.parse(text);

    return isRecord(body) && isRecord(body.error) ? body.error : {};
  } catch {
    return {};
  }
}

/** Whether a 429's error says the key is out of credit (D13): OpenAI's
 * `insufficient_quota`, in the error's `type` or `code`. */
function saysOutOfCredit(error: Record<string, unknown>): boolean {
  return (
    error.type === "insufficient_quota" || error.code === "insufficient_quota"
  );
}

/** Whether a 403's error is OpenRouter's moderation flag: its metadata
 * names the reasons or the flagged input. */
function saysModerated(error: Record<string, unknown>): boolean {
  const metadata = isRecord(error.metadata) ? error.metadata : {};

  return (
    Array.isArray(metadata.reasons) ||
    typeof metadata.flagged_input === "string"
  );
}

function lengthOf(value: unknown): number {
  return typeof value === "string" ? value.length : 0;
}

/** The generated characters one chunk's delta carries: text, and the ids,
 * names and arguments of its tool calls. */
function generatedCharsOf(delta: Record<string, unknown>): number {
  let chars = lengthOf(delta.content);

  if (Array.isArray(delta.tool_calls)) {
    for (const fragment of delta.tool_calls) {
      const call = isRecord(fragment) ? fragment : {};
      const fn = isRecord(call.function) ? call.function : {};

      chars += lengthOf(call.id) + lengthOf(fn.name) + lengthOf(fn.arguments);
    }
  }

  return chars;
}

/** The tool-call index a `delta.tool_calls` entry continues, as
 * `foldToolCallDelta` keys it: its `index`, or its place in the list. */
function toolCallIndexOf(fragment: unknown, position: number): number {
  return isRecord(fragment) && typeof fragment.index === "number"
    ? fragment.index
    : position;
}

/** How many distinct tool calls the reply announces once `delta` is
 * folded in. */
function toolCallCountWith(
  calls: ReadonlyMap<number, PendingToolCall>,
  delta: Record<string, unknown>,
): number {
  if (!Array.isArray(delta.tool_calls)) {
    return calls.size;
  }

  const indexes = new Set(calls.keys());

  delta.tool_calls.forEach((fragment: unknown, position: number) => {
    indexes.add(toolCallIndexOf(fragment, position));
  });

  return indexes.size;
}

/** A body's text if it ends within `maxBytes`; null if it is longer, or
 * cannot be read. Either way the rest is cancelled, never read. */
async function readBodyUpTo(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string | null> {
  if (body === null) {
    return null;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        return text + decoder.decode();
      }

      bytes += value.byteLength;

      if (bytes > maxBytes) {
        return null;
      }

      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    reader.cancel().catch(() => {});
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
        function: {
          name: call.name === "" ? NAMELESS_TOOL_NAME : call.name,
          arguments: call.arguments,
        },
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

  const index = toolCallIndexOf(fragment, position);
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

/** Reads one request's stream to its end, relaying text as it arrives.
 * Throws once the reply passes `REPLY_MAX_CHARS`, which fails the turn. */
async function readReply(
  chunks: AsyncIterable<unknown>,
  turn: RequestTurn,
): Promise<RequestOutcome> {
  const { brain, push, requests, maxReportedCostUsd } = turn;
  let text = "";
  let replyChars = 0;
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
      usage = usageOf(chunk.usage, brain, maxReportedCostUsd);
    }

    const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;

    if (!isRecord(choice)) {
      continue;
    }

    requests.noteGenerating();

    const delta = isRecord(choice.delta) ? choice.delta : {};

    replyChars += generatedCharsOf(delta);

    if (replyChars > REPLY_MAX_CHARS) {
      throw new RangeError("a reply passed the size cap");
    }

    if (toolCallCountWith(calls, delta) > REPLY_MAX_TOOL_CALLS) {
      throw new RangeError("a reply announced too many tool calls");
    }

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

  // Every tool message answers one id, so ids are made unique: a missing
  // or repeated id takes `call_<index>`, suffixed until it is free.
  const usedIds = new Set<string>();
  const toolCalls = [...calls.entries()]
    .sort(([a], [b]) => {
      return a - b;
    })
    .map(([index, call]): PendingToolCall => {
      let id = call.id === "" ? `call_${index}` : call.id;

      for (let suffix = 1; usedIds.has(id); suffix += 1) {
        id = `call_${index}_${suffix}`;
      }

      usedIds.add(id);
      call.id = id;

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
    const model = brain === undefined ? undefined : ownModelOf(brain);

    // Routing sends only a listed own brain here (its cost must be
    // meterable); anything else fails closed, before any request.
    if (brain === undefined || model === undefined) {
      console.error(`${SESSION_NAME}: the turn's brain is not a listed model`);
      push({ type: "error", message: DESK_LINK_FALTERED_MESSAGE });

      return { kind: "errored" };
    }

    const requests = createRequestLedger(options?.meter, brain, signal);
    const maxReportedCostUsd =
      REPORTED_COST_CEILINGS * estimateListedCostUsd(brain, REQUEST_CEILING);

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
        const outcome = await this.requestReply(model, conversation, {
          brain,
          signal,
          push,
          requests,
          maxReportedCostUsd,
        });

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
        // A cancel while the tools ran ends the turn here, before the cap
        // could end it as a reply.
        signal.throwIfAborted();

        if (iteration >= JARVIS_RUNNER_MAX_ITERATIONS) {
          finalText += RUNWAY_EXHAUSTED_NOTICE;
          push({ type: "delta", text: RUNWAY_EXHAUSTED_NOTICE });
          push({ type: "done" });

          return { kind: "completed", finalText };
        }
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
    model: JarvisOwnModel,
    conversation: readonly ChatMessage[],
    turn: RequestTurn,
  ): Promise<RequestOutcome> {
    const { signal, requests } = turn;
    const { url, headers, tokenLimitParam, extraBody, modelBody, fetchFn } =
      this.endpoint;

    // Extra fields first, so none can replace the request's own.
    const body = JSON.stringify({
      ...extraBody,
      ...modelBody(model),
      model: model.modelId,
      messages: conversation,
      tools: this.tools,
      stream: true,
      stream_options: { include_usage: true },
      [tokenLimitParam]: JARVIS_MAX_TOKENS_PER_TURN,
    });

    requests.markRequestSent(body.length);

    // The response must begin within the timeout; a timeout fails the
    // request, and is no cancel: the turn's own signal is not aborted. The
    // stream that follows is bounded by the turn and the parser's caps.
    const timeout = new AbortController();
    const timer = setTimeout(() => {
      timeout.abort(new DOMException("no response in time", "TimeoutError"));
    }, JARVIS_RESPONSE_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetchFn(url, {
        method: "POST",
        headers,
        body,
        redirect: "error",
        signal: AbortSignal.any([signal, timeout.signal]),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const { status } = response;
      const readsBody = status === 429 || status === 403;
      const error = readsBody ? await readErrorObject(response) : {};

      if (!readsBody) {
        response.body?.cancel().catch(() => {});
      }

      return {
        kind: "httpError",
        status,
        outOfCredit: status === 429 && saysOutOfCredit(error),
        moderated: status === 403 && saysModerated(error),
      };
    }

    if (response.body === null) {
      return { kind: "unfinished" };
    }

    return readReply(parseSseChunks(response.body, signal), turn);
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

    // A moderation flag judged the input, not the key.
    const refusesKey =
      outcome.kind === "httpError" &&
      ((KEY_REFUSAL_STATUSES.has(outcome.status) && !outcome.moderated) ||
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
   * does, and answers each with a `tool` message in call order. Calls past
   * `JARVIS_MAX_TOOL_CALLS_PER_REPLY` are answered with an error, not run. */
  private runToolCalls(
    calls: readonly PendingToolCall[],
  ): Promise<ChatMessage[]> {
    return Promise.all(
      calls.map(async (call, position): Promise<ChatMessage> => {
        return {
          role: "tool",
          tool_call_id: call.id,
          content:
            position < JARVIS_MAX_TOOL_CALLS_PER_REPLY
              ? await this.runToolCall(call)
              : "Error: too many tool calls in one reply, so this one did not run.",
        };
      }),
    );
  }

  /** One call's result. A failure goes back to the model as an `Error:`
   * result, worded as the Anthropic SDK runner words it, and never fails the
   * turn. */
  private async runToolCall(call: PendingToolCall): Promise<string> {
    if (call.name === "") {
      return "Error: the call named no tool, so nothing ran.";
    }

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
