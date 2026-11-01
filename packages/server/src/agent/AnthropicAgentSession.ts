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

import type {
  ConfirmGate,
  JarvisConfirmDetails,
  JarvisToolDefinition,
} from "@rtc/agent-tools";
import {
  DEFAULT_JARVIS_BRAIN,
  DEFAULT_JARVIS_EFFORT,
  type DriveBatchV1,
  type JarvisBrain,
  type JarvisEvent,
  type JarvisHistoryEntry,
  type JarvisLiveBrain,
  ownModelOf,
  type PanelSpecV1,
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
import { buildDriveAppTool } from "./driveAppTool.js";
import { JARVIS_SYSTEM_PROMPT } from "./jarvisPersona.js";
import {
  JARVIS_EFFORT_CAPABLE_BRAINS,
  JARVIS_HISTORY_MAX_MESSAGES,
  JARVIS_MAX_TOKENS_PER_TURN,
  JARVIS_MAX_TURNS_PER_SESSION,
  JARVIS_PROMPT_PREFIX_TOKENS,
  JARVIS_RESERVE_INPUT_TOKENS,
  JARVIS_TOOL_FRIENDLY_NAMES,
} from "./jarvisRunnerConfig.js";
import { buildRenderPanelTool } from "./renderPanelTool.js";

/**
 * Caps how many tool-round-trip iterations ONE turn's `toolRunner()` call may
 * take (`stop_reason: "pause_turn"` is the one case this loop resumes
 * automatically — see the doc comment on `AnthropicAgentSession.runOneTurn`
 * — so without a ceiling a model that keeps pausing a long-running turn
 * could keep this loop resuming it forever). Deliberately its OWN constant
 * rather than reusing `JARVIS_MAX_TURNS_PER_SESSION`: that cap counts
 * SESSION turns (one per user message); this one counts API round-trips
 * WITHIN a single turn — different axes, so conflating them would either
 * make one turn eat the whole session's budget or make the session cap too
 * tight for a legitimately multi-tool-call reply. 8 is generous for a
 * "quote, then trade" style turn while still bounding a stuck loop.
 */
const JARVIS_RUNNER_MAX_ITERATIONS = 8;

const REFUSAL_MESSAGE = "I'm afraid I can't assist with that, sir.";
const DESK_LINK_FALTERED_MESSAGE =
  "The desk link faltered, sir — do try again.";

const SESSION_CAP_MESSAGE =
  "We've had quite the session, sir — do reconnect for a fresh one.";

/**
 * Emitted after `cancelTurn()` aborts an in-flight turn. Per the `AgentLoop`
 * seam's doc comment, cancelling guarantees no terminal frame for the
 * cancelled turn — this "error" event is only safe to emit because the
 * client's turnId filter (see `jarvisEffects`' `inFlightTurnId` gate) ignores
 * frames for a turn it no longer considers in flight, so a post-cancel event
 * that does slip through is simply dropped client-side rather than
 * corrupting a later turn's transcript.
 */
const CANCELLED_MESSAGE = "Cancelled, sir.";

const TRUNCATION_NOTICE =
  " …that's as far as I can go this turn, sir — do ask me to continue.";

/** Appended when `JARVIS_RUNNER_MAX_ITERATIONS` cuts the runner off while
 * the model still wanted to call a tool or was mid `pause_turn` — see the
 * post-loop check in `runOneTurn`. */
const RUNWAY_EXHAUSTED_NOTICE =
  " I ran out of runway mid-task, sir — the answer above may be incomplete.";

/** The reply of a turn the daily budget stopped before its first model
 * request (spec §3.3 step 4): there is nothing above it to set it apart from. */
const BUDGET_SPENT_NOTICE =
  "Today's AI budget is used — switching to the scripted brain.";

/** Ends a turn the daily budget stopped between two model requests: the
 * reply so far stays, and the next turn runs scripted. */
const BUDGET_STOP_NOTICE = `\n\n${BUDGET_SPENT_NOTICE}`;

/** What one request is reserved at against the budget while it is in flight
 * — see `JARVIS_RESERVE_INPUT_TOKENS`. */
const REQUEST_CEILING: JarvisTokenUsage = {
  inputTokens: JARVIS_RESERVE_INPUT_TOKENS,
  outputTokens: JARVIS_MAX_TOKENS_PER_TURN,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

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

function friendlyToolName(name: string): string {
  return JARVIS_TOOL_FRIENDLY_NAMES[name] ?? name;
}

/** Production `RenderPanelDeps.mintPanelId` — tests inject their own
 * deterministic mint instead (see `renderPanelTool.test.ts` and this
 * class's own constructor default). Uses the same global `crypto.randomUUID`
 * `requestConfirmation` already relies on below, not a `node:crypto`
 * import — Node exposes Web Crypto globally, so this file has never needed
 * that import for a UUID. */
function defaultMintPanelId(): string {
  return `panel-${crypto.randomUUID()}`;
}

/** Plain code-point order, not `localeCompare` — the cache-prefix
 * determinism this sort exists for (see `SYSTEM_BLOCKS`' doc comment) needs
 * a byte-stable order for the exact same tool-name set every time; a
 * locale-aware compare depends on the ICU/Node build's default locale,
 * which is not guaranteed identical across environments (dev machine vs.
 * the deployed container) the way simple `<`/`>` on ASCII tool names is. */
function toolNameOrder(
  a: BetaRunnableTool<unknown>,
  b: BetaRunnableTool<unknown>,
): number {
  if (a.name < b.name) {
    return -1;
  }

  if (a.name > b.name) {
    return 1;
  }

  return 0;
}

/** What a provider answers for a key it will not serve: unauthorized, out of
 * credit, forbidden. A 429 is not one of them: the key may be fine. */
const KEY_REFUSAL_STATUSES: ReadonlySet<number> = new Set([401, 402, 403]);

/** Whether the tool runner follows this reply with another request: it runs
 * the tools a `tool_use` asked for and sends their results, and it resumes a
 * `pause_turn` once the paused content is pushed back. */
function wouldRequestAgain(stopReason: string | null): boolean {
  return stopReason === "tool_use" || stopReason === "pause_turn";
}

/** Asks the meter whether the budget is spent; a meter that throws counts as
 * spent, so a broken budget never lets a house turn run on unchecked. */
function isBudgetSpent(meter: TurnMeter): boolean {
  try {
    return meter.exhausted();
  } catch (error) {
    console.error(
      "AnthropicAgentSession: meter.exhausted threw —",
      describeSdkErrorForLogging(error),
    );

    return true;
  }
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
    recordSafely(liveMeter, liveBrain, usage);
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
      if (isBudgetSpent(liveMeter)) {
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

/** The rough characters-per-token of English text and JSON, for estimating
 * the usage of a request that never reported its own. */
const CHARS_PER_TOKEN_ESTIMATE = 4;

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

/**
 * Books a request's usage. Own try/catch: by the time this runs the request
 * was already billed by Anthropic and, on the normal path, its reply already
 * streamed, so a throwing meter (a bug in the budget or the usage display, an
 * injected test double gone wrong) must never reach the turn's own catch —
 * that would turn an already-served turn into a sanitized "desk link
 * faltered" error AND drop it from the session's history (`runTurn` appends
 * only on a "completed" outcome), corrupting the NEXT turn's context for a
 * failure that has nothing to do with the model or the conversation.
 */
function recordSafely(
  meter: TurnMeter,
  brain: JarvisLiveBrain,
  usage: JarvisTokenUsage,
): void {
  try {
    meter.record(brain, usage);
  } catch (usageError) {
    console.error(
      "AnthropicAgentSession: meter.record threw —",
      describeSdkErrorForLogging(usageError),
    );
  }
}

function mapHistoryEntry(entry: JarvisHistoryEntry): BetaMessageParam {
  return {
    role: entry.role === "jarvis" ? "assistant" : "user",
    content: entry.text,
  };
}

/**
 * Keeps only the newest `JARVIS_HISTORY_MAX_MESSAGES` messages — every
 * history message replayed is billed input tokens on every subsequent turn
 * (see `JARVIS_HISTORY_MAX_MESSAGES`'s doc comment), so an over-long history
 * is trimmed from the front (oldest first) rather than rejected outright —
 * then drops any now-leading `"assistant"` entries: the Messages API
 * requires `messages[0].role === "user"`, and either the trim boundary
 * above OR the wire layer's OWN 20-entry cap (`JARVIS_HISTORY_MAX_ENTRIES`,
 * enforced in `jarvis.effects.ts`, applied before this ever runs — e.g. a reconnect
 * mid-conversation truncating to a window that happens to start on a
 * "jarvis" reply) can leave an assistant-first array. Left unguarded that's
 * a PERMANENT session brick: the resulting 400 is caught as a generic
 * sanitized error, and since an errored turn appends nothing to history
 * (see `runTurn`'s `.then`), every later turn on this session resends the
 * exact same bad prefix. Runs on every call, not just when trimming
 * actually removed something, since the assistant-first array can arrive
 * already capped (short history, wire-truncated to start wrong).
 */
function capMessages(
  messages: readonly BetaMessageParam[],
): BetaMessageParam[] {
  const capped =
    messages.length > JARVIS_HISTORY_MAX_MESSAGES
      ? messages.slice(-JARVIS_HISTORY_MAX_MESSAGES)
      : [...messages];

  while (capped[0]?.role === "assistant") {
    capped.shift();
  }

  return capped;
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
  private readonly tools: readonly BetaRunnableTool<unknown>[];

  private readonly pendingConfirmations = new Map<
    string,
    (approved: boolean) => void
  >();

  private history: BetaMessageParam[] = [];

  private turnCount = 0;

  private currentPush: ((event: JarvisEvent) => void) | null = null;

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
    mintPanelId: () => string = defaultMintPanelId,
  ) {
    const confirmTrade: ConfirmGate = (details: JarvisConfirmDetails) => {
      return this.requestConfirmation(details);
    };

    const jarvisTools = buildTools(confirmTrade);

    // `render_panel` is LIVE-brain-only (the scripted engine already emits
    // `panel` events itself — see `ScriptedJarvisEngine` — so
    // `ScriptedAgentSession` needs no equivalent). `emitPanel` closes over
    // THIS session's own `currentPush` (via `emitPanelEvent` below) the same
    // way `confirmTrade` above closes over THIS session's own confirmation
    // registry — never a second, competing event channel.
    const renderPanelTool = buildRenderPanelTool({
      knownSymbols,
      emitPanel: (panelId: string, spec: PanelSpecV1): void => {
        this.emitPanelEvent(panelId, spec);
      },
      mintPanelId,
    });

    // `drive_app` is likewise LIVE-brain-only (the scripted engine drives
    // the app via its own scripted intents — see Task 4 of this round — so
    // `ScriptedAgentSession` needs no equivalent tool). `emitDrive` closes
    // over THIS session's own `currentPush` (via `emitCommandEvent` below)
    // the same way `emitPanel` above does, and the same way `confirmTrade`
    // closes over THIS session's own confirmation registry — never a
    // second, competing event channel.
    const driveAppTool = buildDriveAppTool({
      emitDrive: (batch: DriveBatchV1): void => {
        this.emitCommandEvent(batch);
      },
    });

    // Deterministic cache prefix (see SYSTEM_BLOCKS' doc comment): sort by
    // name so the tools block is byte-identical turn to turn regardless of
    // buildTools' own ordering.
    this.tools = [...jarvisTools, renderPanelTool, driveAppTool]
      .map(adaptTool)
      .sort(toolNameOrder);
  }

  /** Pushes a `panel` event onto the SAME per-turn stream every other event
   * (`delta`/`toolEvent`/`confirmRequest`/`done`) goes through — `currentPush`
   * is only non-null while a turn's `runOneTurn` is in flight (see `runTurn`),
   * which is exactly when a tool's `run()` can execute, so this is never
   * reachable with no turn open in practice. `?.` still guards it, matching
   * `requestConfirmation`'s own defensiveness. */
  private emitPanelEvent(panelId: string, spec: PanelSpecV1): void {
    this.currentPush?.({ type: "panel", panelId, spec });
  }

  /** Pushes a `command` event onto the SAME per-turn stream, mirroring
   * `emitPanelEvent` above — see that method's doc comment for why `?.` is
   * defense in depth rather than a reachable branch. */
  private emitCommandEvent(batch: DriveBatchV1): void {
    this.currentPush?.({ type: "command", batch });
  }

  private requestConfirmation(details: JarvisConfirmDetails): Promise<boolean> {
    const push = this.currentPush;

    if (!push) {
      // No turn is currently open to receive this confirmRequest.
      // Registering a resolver here anyway would leak a Promise nothing can
      // ever settle: `resolveConfirmation` and `releasePendingConfirmations`
      // both act on `this.pendingConfirmations`, but nothing would ever push
      // the `confirmRequest` event a client could react to, and no cancel is
      // "in flight" to release it either. Not reachable in the normal
      // single-turn-at-a-time flow — kept as defense in depth against
      // exactly the kind of concurrent-turn race `jarvis.chat`'s `concatMap`
      // serialization (see `jarvis.effects.ts`) now rules out at the wire
      // layer.
      return Promise.resolve(false);
    }

    const confirmationId = `confirm-${crypto.randomUUID()}`;

    return new Promise<boolean>((resolve) => {
      this.pendingConfirmations.set(confirmationId, resolve);
      push({
        type: "confirmRequest",
        confirmationId,
        symbol: details.symbol,
        direction: details.direction,
        notional: details.notional,
        quotedPrice: details.quotedPrice,
        ratePrecision: details.ratePrecision,
      });
    });
  }

  resolveConfirmation(confirmationId: string, approved: boolean): void {
    const resolve = this.pendingConfirmations.get(confirmationId);

    if (!resolve) {
      return;
    }

    this.pendingConfirmations.delete(confirmationId);
    resolve(approved);
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
        this.history = capMessages(history.map(mapHistoryEntry));
      }

      const userMessage: BetaMessageParam = { role: "user", content: text };
      const requestMessages = [...this.history, userMessage];
      const controller = new AbortController();
      this.currentAbort = controller;
      this.currentPush = push;

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
          this.currentPush = null;
          complete();
        });

      return (): void => {
        closed = true;
        controller.abort();
        this.releasePendingConfirmations();
      };
    });
  }

  /**
   * A turn torn down mid-trade (cancel, dispose, unsubscribe) would
   * otherwise strand its resolver forever and leave `requestConfirmation`'s
   * promise dangling — resolve every outstanding one `false` so
   * `execute_trade`'s `run` unblocks instead of hanging. Called from BOTH
   * `cancelTurn()` (so a cancel arriving while a confirmation is in flight
   * unblocks it immediately — `controller.abort()` alone only cancels the
   * SDK's network request, not this session's separate, signal-unaware
   * confirmation `Promise`, so `runOneTurn` would otherwise stay stuck
   * awaiting a tool call that's awaiting a confirmation nothing will ever
   * resolve) and the Observable's own teardown below (belt-and-suspenders
   * for a socket-disconnect unsubscribe that bypasses `cancelTurn()`).
   */
  private releasePendingConfirmations(): void {
    for (const resolve of this.pendingConfirmations.values()) {
      resolve(false);
    }

    this.pendingConfirmations.clear();
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
    const takesEffort = JARVIS_EFFORT_CAPABLE_BRAINS.has(model);
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
      // `JARVIS_EFFORT_CAPABLE_BRAINS` — see that constant's doc comment for
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
      if (
        options?.keyFailure !== undefined &&
        hasNumericStatus(error) &&
        KEY_REFUSAL_STATUSES.has(error.status)
      ) {
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
    this.releasePendingConfirmations();
  }

  dispose(): void {
    this.cancelTurn();
  }
}
