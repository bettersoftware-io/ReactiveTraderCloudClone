import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import type {
  BetaToolRunnerParams,
  BetaToolRunnerRequestOptions,
} from "@anthropic-ai/sdk/lib/tools/BetaToolRunner";
import type {
  BetaMessageParam,
  BetaRawContentBlockDelta,
  BetaRawMessageStreamEvent,
  BetaTextBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { Observable } from "rxjs";

import type { ConfirmGate, JarvisToolDefinition } from "@rtc/agent-tools";
import {
  DEFAULT_JARVIS_BRAIN,
  DEFAULT_JARVIS_EFFORT,
  type JarvisBrain,
  type JarvisEvent,
  type JarvisHistoryEntry,
  type JarvisLiveBrain,
  jarvisBrainTakesEffort,
  ownModelOf,
} from "@rtc/domain";

import type { TurnMeter } from "../services/jarvisBudget/JarvisBudgetService.js";
import type { JarvisTokenUsage } from "../services/UsageMeter.js";
import {
  type AgentSession,
  describeRefusedKey,
  describeSdkErrorForLogging,
  hasNumericStatus,
  type JarvisTurnOptions,
} from "./agentLoop.js";
import { JARVIS_SYSTEM_PROMPT } from "./jarvisPersona.js";
import {
  JARVIS_MAX_TOKENS_PER_TURN,
  JARVIS_MAX_TURNS_PER_SESSION,
  JARVIS_PROMPT_PREFIX_TOKENS,
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
  historyMessageOf,
  isBudgetSpent,
  KEY_REFUSAL_STATUSES,
  REQUEST_CEILING,
  recordSafely,
} from "./liveSessionRules.js";

/** Names this session in its log lines. */
const SESSION_NAME = "AnthropicAgentSession";

const SYSTEM_BLOCKS: readonly BetaTextBlockParam[] = [
  {
    type: "text",
    text: JARVIS_SYSTEM_PROMPT,
    // Ephemeral cache breakpoint on the persona block: paired with sorting
    // tools by name below, the system+tools prefix is stable turn-to-turn,
    // so every turn after the first CAN re-hit the cache instead of
    // re-billing the full prefix as fresh input tokens — "can", not "always
    // does": the minimum cacheable prefix length is MODEL-SPECIFIC, not a
    // single number for "this model". It's 512 tokens on the sonnet/opus-
    // class models but 4,096 tokens on Haiku 4.5 (the brain
    // `DEFAULT_JARVIS_BRAIN` now defaults to) — a much higher bar. Today's
    // persona+eight-tool-schema prefix (seven `@rtc/agent-tools` desk tools
    // plus `render_panel`, whose input schema embeds the full
    // `PANEL_SPEC_JSON_SCHEMA`) is only ~2.1k tokens: comfortably over 512
    // (sonnet/opus cache turn-to-turn as intended) but under 4,096
    // (Haiku's breakpoint is a silent no-op — the API just serves the
    // request uncached, no error). That's an accepted tradeoff, not a bug:
    // Haiku's per-token input price is already ~5x cheaper than the cache
    // discount would save, and `cacheReadTokens: 0` on every Haiku turn
    // (visible in the usage display this cache_control feeds) is the
    // EXPECTED signature of "prefix under the model's own minimum", not a
    // broken tap. Left in place unconditionally (not gated on the resolved
    // brain) because it's harmless on Haiku and load-bearing on sonnet/opus.
    cache_control: { type: "ephemeral" },
  },
];

/** The one-shot streaming request shape every turn sends — named so it isn't
 * repeated as an inline intersection type at each use site. */
export type AnthropicToolRunnerRequest = BetaToolRunnerParams & {
  readonly stream: true;
};

/**
 * Minimal shape this loop reads off a completed API turn — looser than the
 * SDK's own `BetaMessage` (a dozen-plus required fields: `usage`,
 * `container`, `diagnostics`, …) so fake-runner tests can build one with two
 * fields. The real `BetaMessageStream.finalMessage()` return
 * (`Promise<BetaMessage>`) is directly assignable to this — structurally a
 * strict superset — so the production default factory
 * (`AnthropicAgentLoop`'s `buildDefaultRunnerFactory`) needs no cast.
 *
 * `usage` is optional (mirroring the fixture-friendliness above), and its
 * cache fields are `| null` — matching the real SDK's `BetaUsage`, which
 * reports `cache_read_input_tokens`/`cache_creation_input_tokens` as
 * `number | null` (not just `number`) when a turn used no cache at all; a
 * narrower `number | undefined` here would make the real
 * `BetaMessageStream.finalMessage()` return no longer structurally
 * assignable to this type, forcing the very cast this seam exists to avoid
 * (see the doc comment above). `?? 0` at the read site (`runOneTurn`'s
 * post-`finalMessage()` usage tap) treats every one of `undefined`/`null`/
 * omitted-`usage`-entirely as zero rather than throwing.
 */
export interface AnthropicFinalMessage {
  readonly stop_reason: string | null;
  readonly content: readonly unknown[];
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly cache_read_input_tokens?: number | null;
    readonly cache_creation_input_tokens?: number | null;
  };
}

/**
 * One tool-runner iteration's stream: the same shape the SDK's own
 * `BetaMessageStream` exposes (raw event iteration + `finalMessage()`), but
 * as a plain interface. `BetaMessageStream` is a class with a private field,
 * which makes it a nominal type TypeScript won't let a fake object satisfy
 * directly — this interface is the seam fake-runner tests build against
 * instead; a real `BetaMessageStream` satisfies it structurally with no cast
 * (upcasting an instance to a narrower interface never needs one, private
 * fields or not).
 */
export interface AnthropicMessageStream
  extends AsyncIterable<BetaRawMessageStreamEvent> {
  finalMessage(): Promise<AnthropicFinalMessage>;
}

/**
 * One session's tool-runner. Same reasoning as `AnthropicMessageStream` —
 * the SDK's own `BetaToolRunner` is a class with a private field.
 * `pushMessages` deliberately keeps the SDK's own `BetaMessageParam` element
 * type (not a narrower ad-hoc one): the real runner's
 * `pushMessages(...messages: BetaMessageParam[]): void` then satisfies this
 * fixed-arity single-parameter signature with no cast — a rest-parameter
 * function assigns cleanly onto a fixed-arity target with the same element
 * type.
 */
export interface AnthropicRunner extends AsyncIterable<AnthropicMessageStream> {
  pushMessages(message: BetaMessageParam): void;
  /** The conversation the runner's next or current request sends — the
   * turn's messages plus every reply and tool result since. The real runner
   * has it; a fake may leave it out, and the turn's own messages stand in. */
  readonly params?: { readonly messages: readonly BetaMessageParam[] };
}

/**
 * The injection seam `AnthropicAgentLoop` tests fake and production wraps
 * `client.beta.messages.toolRunner(..., stream: true)` with. A
 * `BetaToolRunner<true>` satisfies `AnthropicRunner` structurally (see the
 * doc comments on `AnthropicRunner`/`AnthropicMessageStream`), so
 * `AnthropicAgentLoop`'s default factory is a plain pass-through — that
 * assignment type-checking with NO cast is the "did the SDK change shape
 * under us" witness the task brief asks compiling against the real SDK
 * types to provide.
 */
export type AnthropicRunnerFactory = (
  params: AnthropicToolRunnerRequest,
  options: BetaToolRunnerRequestOptions,
) => AnthropicRunner;

/**
 * betaTool's generic `inputSchema` wants the `json-schema-to-ts` flavor of
 * JSON Schema; `JarvisToolDefinition.inputSchema` is deliberately SDK-free
 * (`Record<string, unknown>` — see its doc comment in `@rtc/agent-tools`), so
 * agent-tools never depends on an SDK type. `as never` bridges the two type
 * systems (the runtime value is unchanged — every real schema
 * `buildJarvisTools` builds already satisfies plain JSON Schema) without
 * asserting a specific, possibly-wrong shape for the SDK's schema type;
 * `run`'s `args` is deliberately left typed `never` (rather than `unknown`),
 * since `never` is what `betaTool` actually expects there once `Schema`
 * resolves to `never` — the final `as unknown as` re-widens the whole tool
 * back to this loop's own (non-generic) working type, which is all
 * `AnthropicAgentSession` needs.
 */
function adaptTool(tool: JarvisToolDefinition): BetaRunnableTool<unknown> {
  const runnable = betaTool({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as never,
    run(args: never): Promise<string> {
      return tool.run(args);
    },
  });

  return runnable as unknown as BetaRunnableTool<unknown>;
}

/** Anthropic's answer to a key with no credit, as far as anyone recalls: a 400
 * `invalid_request_error` saying the credit balance is too low. To be
 * confirmed by the real-key run (B3c Task 14). */
const OUT_OF_CREDIT_TEXT = /credit balance/i;

/** Whether a provider's error means it will not serve this key (D13). The
 * message is read for this one test and goes nowhere else. */
function isKeyRefusal(error: unknown): boolean {
  if (!hasNumericStatus(error)) {
    return false;
  }

  return (
    KEY_REFUSAL_STATUSES.has(error.status) ||
    (error.status === 400 &&
      error instanceof Error &&
      OUT_OF_CREDIT_TEXT.test(error.message))
  );
}

/** Whether the tool runner follows this reply with another request: it runs
 * the tools a `tool_use` asked for and sends their results, and it resumes a
 * `pause_turn` once the paused content is pushed back. */
function wouldRequestAgain(stopReason: string | null): boolean {
  return stopReason === "tool_use" || stopReason === "pause_turn";
}

/** Running token counts of a request still streaming. */
interface AccruedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/**
 * One turn's requests, as its budget sees them (spec §3.3 steps 4–5). Every
 * request is reserved before it is made and booked after, and a request that
 * never finishes is still booked with what it used: the model bills from the
 * moment it starts, so a cancel, a dropped socket or an error mid-stream must
 * not make a request free. Without a meter every call is a no-op and every
 * request may go ahead.
 */
interface RequestLedger {
  /** Before a request: false when the budget is spent, with nothing
   * reserved; otherwise reserves the request's worst case. */
  beginRequest(): boolean;
  /** When the runner hands over the reserved request's stream: from here it
   * may be billed. A stream handed over after the turn was cancelled was
   * never sent — the SDK does not send a request on an aborted signal. */
  markRequestSent(): void;
  /** Folds one stream event into the request's running count. */
  noteUsage(event: BetaRawMessageStreamEvent): void;
  /** Books a finished request's usage; it is then no longer open. */
  bookFinalUsage(usage: AnthropicFinalMessage["usage"]): void;
  /** Once the turn is over, however it ended: books what an unfinished
   * request used, or releases its reservation — see `settle` below. */
  settle(): void;
}

interface RequestLedgerDeps {
  readonly meter: TurnMeter | undefined;
  /** What each request is booked under; an own brain keeps its own price. */
  readonly brain: JarvisBrain;
  /** The brain thinks before it replies: see `estimateAbortedOutputTokens`. */
  readonly thinks: boolean;
  /** The turn's signal: aborted means the person cancelled the turn. */
  readonly signal: AbortSignal;
  /** The messages the open request sent. */
  readonly readRequestMessages: () => readonly BetaMessageParam[];
}

function createRequestLedger(deps: RequestLedgerDeps): RequestLedger {
  const { meter, brain, thinks, signal, readRequestMessages } = deps;

  // `brain !== "scripted"` only narrows the type: `DEFAULT_JARVIS_BRAIN` is
  // typed as any brain, but a scripted turn never reaches this session.
  if (meter === undefined || brain === "scripted") {
    return {
      beginRequest: (): boolean => {
        return true;
      },
      markRequestSent: (): void => {},
      noteUsage: (): void => {},
      bookFinalUsage: (): void => {},
      settle: (): void => {},
    };
  }

  const liveMeter: TurnMeter = meter;
  const liveBrain: JarvisLiveBrain = brain;
  // A request has been reserved and not yet booked or released.
  let open = false;
  // The open request went out (see `markRequestSent`).
  let sent = false;
  // What the open request has reported so far; null before its
  // `message_start`, which is the first event to carry usage.
  let accrued: AccruedUsage | null = null;
  // The open request's `message_delta` arrived: its output count is final.
  let outputReported = false;
  // Characters of generated content the open request has streamed so far.
  let streamedChars = 0;

  function book(usage: JarvisTokenUsage): void {
    open = false;
    accrued = null;
    recordSafely(liveMeter, liveBrain, usage, SESSION_NAME);
  }

  function release(): void {
    open = false;
    liveMeter.endRequest();
  }

  /** The output of a request that never reported its own, at ~4 characters
   * a token of what streamed. */
  function estimateStreamedOutputTokens(reportedTokens: number): number {
    return Math.max(
      reportedTokens,
      Math.ceil(streamedChars / CHARS_PER_TOKEN_ESTIMATE),
    );
  }

  /**
   * The output of a cancelled request. A thinking brain runs adaptive
   * thinking with its display omitted, so its thinking streams no
   * characters while every thinking token is billed: until the provider
   * reports the count, the per-request cap is the only bound that cannot
   * run under. Other brains stream what they generate, so the estimate
   * tracks it.
   */
  function estimateAbortedOutputTokens(reportedTokens: number): number {
    if (thinks && !outputReported) {
      return JARVIS_MAX_TOKENS_PER_TURN;
    }

    return estimateStreamedOutputTokens(reportedTokens);
  }

  return {
    beginRequest: (): boolean => {
      if (isBudgetSpent(liveMeter, SESSION_NAME)) {
        return false;
      }

      liveMeter.beginRequest(liveBrain, REQUEST_CEILING);
      open = true;
      sent = false;
      accrued = null;
      outputReported = false;
      streamedChars = 0;

      return true;
    },
    markRequestSent: (): void => {
      if (open && !signal.aborted) {
        sent = true;
      }
    },
    noteUsage: (event: BetaRawMessageStreamEvent): void => {
      if (event.type === "message_start") {
        const usage = event.message.usage;

        accrued = {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheReadTokens: usage.cache_read_input_tokens ?? 0,
          cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
        };
      } else if (event.type === "content_block_delta") {
        streamedChars += streamedLengthOf(event.delta);
      } else if (event.type === "message_delta" && accrued !== null) {
        // The counts on a `message_delta` are cumulative for the request.
        const usage = event.usage;

        outputReported = true;
        accrued.outputTokens = usage.output_tokens;
        accrued.inputTokens = usage.input_tokens ?? accrued.inputTokens;
        accrued.cacheReadTokens =
          usage.cache_read_input_tokens ?? accrued.cacheReadTokens;
        accrued.cacheCreationTokens =
          usage.cache_creation_input_tokens ?? accrued.cacheCreationTokens;
      }
    },
    bookFinalUsage: (usage: AnthropicFinalMessage["usage"]): void => {
      // `?? 0` covers both a fixture that omits `usage` and any one of its
      // four sub-counts the real SDK response might not carry.
      book({
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
        cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
      });
    },
    /**
     * The provider reports a request's input on `message_start` and its
     * output once, on the `message_delta` just before `message_stop`; a
     * request cut short never gets there, though every token it read and
     * generated is billed. So:
     *
     * - a request never sent is released;
     * - a CANCELLED request is always booked — input as reported, or
     *   estimated from its messages when cancelled before `message_start`
     *   (otherwise a client could loop chat and cancel on the house key with
     *   nothing recorded), and output per `estimateAbortedOutputTokens`;
     * - a request that FAILED before reporting usage is released: the
     *   provider sends `message_start` before it generates, so an error that
     *   early is a request it refused or never got (overloaded, rate-limited,
     *   unreachable), and a client cannot set one off at will the way it can
     *   a cancel. One that failed later is booked as reported, its output
     *   estimated from what streamed.
     */
    settle: (): void => {
      if (!open) {
        return;
      }

      if (!sent) {
        release();

        return;
      }

      if (signal.aborted) {
        book({
          ...(accrued ?? estimateUnreportedInput(readRequestMessages())),
          outputTokens: estimateAbortedOutputTokens(accrued?.outputTokens ?? 0),
        });

        return;
      }

      if (accrued === null) {
        release();

        return;
      }

      book({
        ...accrued,
        outputTokens: estimateStreamedOutputTokens(accrued.outputTokens),
      });
    },
  };
}

/** The input of a request the provider never reported: its messages as sent
 * (JSON, so tool calls and results count) at ~4 characters a token, plus the
 * persona and tools prefix. All of it counts as fresh input — a cache read
 * would have been cheaper, so the estimate errs high. */
function estimateUnreportedInput(
  messages: readonly BetaMessageParam[],
): AccruedUsage {
  return {
    inputTokens:
      Math.ceil(JSON.stringify(messages).length / CHARS_PER_TOKEN_ESTIMATE) +
      JARVIS_PROMPT_PREFIX_TOKENS,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
}

/** The generated characters one content delta carries: reply text, thinking
 * and tool-call input all count as output. */
function streamedLengthOf(delta: BetaRawContentBlockDelta): number {
  switch (delta.type) {
    case "text_delta":
      return delta.text.length;
    case "thinking_delta":
      return delta.thinking.length;
    case "input_json_delta":
      return delta.partial_json.length;
    default:
      return 0;
  }
}

type TurnOutcome =
  | { readonly kind: "completed"; readonly finalText: string }
  | { readonly kind: "refused" | "aborted" | "errored" };

/**
 * One connection's Anthropic-backed conversation. Owns its OWN
 * pending-confirmation registry (id → resolver) and its own tool set — built
 * ONCE here, in the constructor, via the `buildTools` callback
 * `AnthropicAgentLoop` injects (see `AnthropicAgentLoopOptions.buildTools`'s
 * doc comment for why tools can't be a flat loop-level array:
 * `execute_trade`'s confirm gate must close over THIS session's own event
 * stream and registry, never another connection's). `createSession()`
 * calling this constructor is allocation-only — building `betaTool` wrappers
 * is pure object construction, no I/O, no network.
 */
export class AnthropicAgentSession implements AgentSession {
  private readonly desk: LiveSessionDesk;

  private readonly tools: readonly BetaRunnableTool<unknown>[];

  private history: BetaMessageParam[] = [];

  private turnCount = 0;

  private currentAbort: AbortController | null = null;

  constructor(
    private readonly runnerFactory: AnthropicRunnerFactory,
    buildTools: (confirmTrade: ConfirmGate) => readonly JarvisToolDefinition[],
    // `render_panel`'s roster check — see `RenderPanelDeps.knownSymbols`'s
    // doc comment. Defaulted to `[]` (parsePanelSpec treats an empty roster
    // as "skip the membership check") rather than made required, so every
    // existing test/call site that doesn't care about panels is unaffected.
    knownSymbols: readonly string[] = [],
    // Test seam only — production always takes the `defaultMintPanelId`
    // below, never overriding it. Not threaded through
    // `AnthropicAgentLoopOptions`: nothing in production needs a different
    // mint strategy, unlike `knownSymbols`, which genuinely varies (the real
    // pair roster vs. a test's fixture roster).
    mintPanelId?: () => string,
  ) {
    this.desk = new LiveSessionDesk(buildTools, knownSymbols, mintPanelId);
    this.tools = this.desk.tools.map(adaptTool);
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

      // Session history is seeded from the wire's `history` ONCE, on this
      // session's first turn; every turn after that grows the session's OWN
      // copy (see the `.then` below) rather than re-trusting whatever the
      // client happens to resend — the wire's `history` param exists so a
      // brand-new session (first turn) has context, not as an ongoing
      // per-turn source of truth.
      if (this.history.length === 0 && history.length > 0) {
        this.history = capMessages<BetaMessageParam>(
          history.map(historyMessageOf),
        );
      }

      const userMessage: BetaMessageParam = { role: "user", content: text };
      const requestMessages = [...this.history, userMessage];
      const controller = new AbortController();
      this.currentAbort = controller;
      this.desk.bindTurn({ push, signal: controller.signal });

      // Fire-and-forget from this synchronous Observable executor (it has no
      // `await` context of its own): runOneTurn never rejects — its own
      // try/catch turns every failure into a pushed error event — so `void`
      // here just opts out of an unneeded await, not error handling.
      void this.runOneTurn(requestMessages, controller.signal, push, options)
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
   * Drives one turn's `toolRunner()` to completion, relaying events as it
   * goes. `stop_reason: "pause_turn"` is the one branch this loop resumes
   * automatically rather than surfacing to the caller: per the SDK's own
   * guidance the runner does NOT auto-resume a paused turn, so this pushes
   * the paused assistant turn back via `pushMessages` (which marks the
   * runner's params "mutated", the signal its own internal loop uses to
   * keep going without a tool result) and lets the same outer `for await`
   * pick the next iteration back up — bounded by `max_iterations` /
   * `JARVIS_RUNNER_MAX_ITERATIONS` so a model that keeps pausing can't spin
   * this forever.
   */
  private async runOneTurn(
    messages: BetaMessageParam[],
    signal: AbortSignal,
    push: (event: JarvisEvent) => void,
    options: JarvisTurnOptions | undefined,
  ): Promise<TurnOutcome> {
    // `options?.brain` is resolved+validated upstream (see `JarvisTurnOptions`'
    // doc comment) — this is the one place that turns "no explicit pick" into
    // the actual default, so every call site below (the request params AND
    // the usage tap) shares one resolved brain rather than each re-deriving
    // it and risking drift. The provider hears the model id; the meter hears
    // the brain, which on an own key is a different string.
    const brain: JarvisBrain = options?.brain ?? DEFAULT_JARVIS_BRAIN;
    const model = ownModelOf(brain)?.modelId ?? brain;
    const takesEffort = jarvisBrainTakesEffort(brain);
    // Set once the runner exists; the ledger reads its current conversation
    // to estimate a request cancelled before it reported its usage.
    let runner: AnthropicRunner | undefined;
    const requests = createRequestLedger({
      meter: options?.meter,
      brain,
      thinks: takesEffort,
      signal,
      readRequestMessages: (): readonly BetaMessageParam[] => {
        return runner?.params?.messages ?? messages;
      },
    });

    const params: AnthropicToolRunnerRequest = {
      model,
      max_tokens: JARVIS_MAX_TOKENS_PER_TURN,
      max_iterations: JARVIS_RUNNER_MAX_ITERATIONS,
      // Effort is omitted entirely (not just defaulted) for a brain outside
      // `jarvisBrainTakesEffort` — see that helper's doc comment for
      // why sending it there would be an unvalidated request shape, not a
      // harmless no-op. `DEFAULT_JARVIS_EFFORT` (`@rtc/domain` — the same
      // constant the preferences UI defaults to, so there is exactly one
      // source of truth for "medium") is not a sampling param (doesn't
      // affect determinism the way temperature would): it caps the model's
      // own reasoning effort, distinct from `JARVIS_MAX_TOKENS_PER_TURN`
      // (which caps generation length, not how much of that budget goes to
      // thinking before generation starts). Thinking is adaptive-by-default
      // on the effort-capable brains at effort `"high"`, and thinking
      // tokens draw from the SAME `max_tokens` ceiling as the visible
      // reply: an unbounded-effort, tool-heavy turn can burn the whole
      // budget thinking and deliver nothing but the `max_tokens` truncation
      // notice. `"medium"` is a deliberate cost/quality tradeoff for a
      // terse, 2–4-sentence desk-assistant persona.
      ...(takesEffort
        ? {
            output_config: {
              effort: options?.effort ?? DEFAULT_JARVIS_EFFORT,
            },
          }
        : {}),
      system: SYSTEM_BLOCKS as BetaTextBlockParam[],
      tools: [...this.tools],
      messages,
      stream: true,
    };
    let finalText = "";
    // Tracks the LAST iteration's stop_reason so a fall-through completion
    // (the loop just ends — no refusal/max_tokens early return) can tell
    // apart a genuine end_turn from `max_iterations` cutting the runner off
    // mid-task (see the post-loop check below).
    let lastStopReason: string | null = null;

    try {
      // The budget check before the first request: a turn routed while the
      // budget lasted can find it spent by now (another tab, another person
      // at the house cap), and then makes no request at all.
      if (!requests.beginRequest()) {
        push({ type: "delta", text: BUDGET_SPENT_NOTICE });
        push({ type: "done" });

        return { kind: "completed", finalText: BUDGET_SPENT_NOTICE };
      }

      runner = this.runnerFactory(params, { signal });

      for await (const messageStream of runner) {
        requests.markRequestSent();

        // Indices are scoped to ONE messageStream (one API response) — a
        // fresh map every iteration.
        const openToolIndexes = new Map<number, string>();

        for await (const event of messageStream) {
          requests.noteUsage(event);

          if (
            event.type === "content_block_start" &&
            event.content_block.type === "tool_use"
          ) {
            openToolIndexes.set(event.index, event.content_block.name);
            push({
              type: "toolEvent",
              tool: friendlyToolName(event.content_block.name),
              status: "running",
            });
          } else if (event.type === "content_block_stop") {
            const toolName = openToolIndexes.get(event.index);

            if (toolName) {
              openToolIndexes.delete(event.index);
              push({
                type: "toolEvent",
                tool: friendlyToolName(toolName),
                status: "done",
              });
            }
          } else if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            finalText += event.delta.text;
            push({ type: "delta", text: event.delta.text });
          }
        }

        const message = await messageStream.finalMessage();
        lastStopReason = message.stop_reason;

        // Booked once per RUNNER iteration (not once per turn) — a
        // multi-iteration turn (tool round-trips, a pause_turn resume) bills
        // the API once per iteration, so the meter's counts need to match
        // that, not collapse to the turn's final iteration alone.
        requests.bookFinalUsage(message.usage);

        if (message.stop_reason === "refusal") {
          push({ type: "error", message: REFUSAL_MESSAGE });

          return { kind: "refused" };
        }

        if (message.stop_reason === "max_tokens") {
          finalText += TRUNCATION_NOTICE;
          push({ type: "delta", text: TRUNCATION_NOTICE });
          push({ type: "done" });

          return { kind: "completed", finalText };
        }

        // The budget check before every further request (spec §3.3 step 4):
        // the runner makes the next request when this loop asks it for the
        // next iteration, so this is the last moment to stop it, and the
        // moment to reserve that request. Only a reply that would continue
        // is cut — one that already ended keeps its own ending, and the next
        // turn runs scripted anyway. Leaving the `for await` early returns
        // the runner, which then sends nothing. (A reservation made here for
        // a request `max_iterations` then never sends is released by
        // `settle`.)
        if (
          wouldRequestAgain(message.stop_reason) &&
          !requests.beginRequest()
        ) {
          finalText += BUDGET_STOP_NOTICE;
          push({ type: "delta", text: BUDGET_STOP_NOTICE });
          push({ type: "done" });

          return { kind: "completed", finalText };
        }

        if (message.stop_reason === "pause_turn") {
          runner.pushMessages({
            role: "assistant",
            content: message.content as unknown as BetaMessageParam["content"],
          });
        }
      }

      // The runner's OWN loop ended without a refusal/max_tokens early
      // return — normally because the model reached a natural end_turn, but
      // also when `max_iterations`/`JARVIS_RUNNER_MAX_ITERATIONS` cuts it
      // off while the model still wanted to call a tool or was mid
      // `pause_turn` continuation. Falling straight through to `done` in
      // that case reports a truncated answer as a clean success — flag it
      // instead.
      if (lastStopReason === "tool_use" || lastStopReason === "pause_turn") {
        finalText += RUNWAY_EXHAUSTED_NOTICE;
        push({ type: "delta", text: RUNWAY_EXHAUSTED_NOTICE });
      }

      push({ type: "done" });

      return { kind: "completed", finalText };
    } catch (error) {
      if (signal.aborted) {
        push({ type: "error", message: CANCELLED_MESSAGE });

        return { kind: "aborted" };
      }

      // Server-side only, and deliberately narrow: the error constructor
      // name (e.g. "RateLimitError") + HTTP status if the SDK's own error
      // class carries one — enough to tell auth/rate-limit/malformed-request
      // apart in production logs — but NEVER `error.message` (may quote
      // request content) and NEVER anything key-shaped. The client-facing
      // event stays the single sanitized message below regardless.
      console.error(
        "AnthropicAgentSession: turn failed —",
        describeSdkErrorForLogging(error),
      );

      // On a person's own key the provider's refusal is theirs to act on
      // (D13): the turn says so, and the key reads refused from here on. It
      // never falls back to another key.
      if (options?.keyFailure !== undefined && isKeyRefusal(error)) {
        push({
          type: "error",
          message: describeRefusedKey(options.keyFailure.providerName),
        });
        options.keyFailure.refused();

        return { kind: "errored" };
      }

      push({ type: "error", message: DESK_LINK_FALTERED_MESSAGE });

      return { kind: "errored" };
    } finally {
      requests.settle();
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
