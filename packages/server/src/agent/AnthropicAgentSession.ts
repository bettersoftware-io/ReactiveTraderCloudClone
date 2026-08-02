import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import type {
  BetaToolRunnerParams,
  BetaToolRunnerRequestOptions,
} from "@anthropic-ai/sdk/lib/tools/BetaToolRunner";
import type {
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  BetaTextBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { Observable } from "rxjs";

import type {
  ConfirmGate,
  JarvisConfirmDetails,
  JarvisToolDefinition,
} from "@rtc/agent-tools";
import { DEFAULT_JARVIS_BRAIN } from "@rtc/domain";
import type { JarvisEvent, JarvisHistoryEntry } from "@rtc/shared";

import type { UsageMeter } from "../services/UsageMeter.js";
import type { AgentSession, JarvisTurnOptions } from "./agentLoop.js";
import { JARVIS_SYSTEM_PROMPT } from "./jarvisPersona.js";
import {
  JARVIS_EFFORT,
  JARVIS_EFFORT_CAPABLE_BRAINS,
  JARVIS_HISTORY_MAX_MESSAGES,
  JARVIS_MAX_TOKENS_PER_TURN,
  JARVIS_MAX_TURNS_PER_SESSION,
  JARVIS_TOOL_FRIENDLY_NAMES,
} from "./jarvisRunnerConfig.js";

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

const SYSTEM_BLOCKS: readonly BetaTextBlockParam[] = [
  {
    type: "text",
    text: JARVIS_SYSTEM_PROMPT,
    // Ephemeral cache breakpoint on the persona block: paired with sorting
    // tools by name below, the system+tools prefix is stable turn-to-turn
    // (the model guidance's minimum cacheable prefix on this model is 512
    // tokens, comfortably under the persona+seven-tool-schema prefix), so
    // every turn after the first re-hits the cache instead of re-billing the
    // full prefix as fresh input tokens.
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

function mapHistoryEntry(entry: JarvisHistoryEntry): BetaMessageParam {
  return {
    role: entry.role === "jarvis" ? "assistant" : "user",
    content: entry.text,
  };
}

interface StatusCarrier {
  readonly status: unknown;
}

interface NumericStatusCarrier {
  readonly status: number;
}

function hasNumericStatus(value: unknown): value is NumericStatusCarrier {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof (value as StatusCarrier).status === "number"
  );
}

/** Server-log-only summary of a thrown SDK/network error: the constructor
 * name (duck-typed, not an `instanceof` check against a specific SDK error
 * class — every failure mode here, including a plain network `TypeError`,
 * should still produce SOMETHING useful) plus an HTTP status if the thrown
 * value carries one (the SDK's own `APIError` does). Never reads
 * `error.message` — that can quote request content — and never anything
 * key-shaped. */
function describeSdkErrorForLogging(error: unknown): string {
  const name = error instanceof Error ? error.constructor.name : typeof error;

  return hasNumericStatus(error) ? `${name} (status ${error.status})` : name;
}

/**
 * Keeps only the newest `JARVIS_HISTORY_MAX_MESSAGES` messages — every
 * history message replayed is billed input tokens on every subsequent turn
 * (see `JARVIS_HISTORY_MAX_MESSAGES`'s doc comment), so an over-long history
 * is trimmed from the front (oldest first) rather than rejected outright —
 * then drops any now-leading `"assistant"` entries: the Messages API
 * requires `messages[0].role === "user"`, and either the trim boundary
 * above OR the wire layer's OWN 20-entry cap (`JARVIS_WIRE_HISTORY_MAX_ENTRIES`
 * in `jarvis.effects.ts`, applied before this ever runs — e.g. a reconnect
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
    // Injected the same way `runnerFactory`/`buildTools` are — omitted in
    // tests that don't care about usage accounting, so the meter tap below
    // is a no-op unless a real `UsageMeter` (or a test spy satisfying this
    // narrow `Pick`) is actually wired in.
    private readonly usageMeter?: Pick<UsageMeter, "recordTokens">,
  ) {
    const confirmTrade: ConfirmGate = (details: JarvisConfirmDetails) => {
      return this.requestConfirmation(details);
    };

    const jarvisTools = buildTools(confirmTrade);

    // Deterministic cache prefix (see SYSTEM_BLOCKS' doc comment): sort by
    // name so the tools block is byte-identical turn to turn regardless of
    // buildTools' own ordering.
    this.tools = [...jarvisTools].map(adaptTool).sort(toolNameOrder);
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
    // the usage tap) shares one resolved model rather than each re-deriving
    // it and risking drift.
    const model = options?.brain ?? DEFAULT_JARVIS_BRAIN;
    const params: AnthropicToolRunnerRequest = {
      model,
      max_tokens: JARVIS_MAX_TOKENS_PER_TURN,
      max_iterations: JARVIS_RUNNER_MAX_ITERATIONS,
      // Effort is omitted entirely (not just defaulted) for a brain outside
      // `JARVIS_EFFORT_CAPABLE_BRAINS` — see that constant's doc comment for
      // why sending it there would be an unvalidated request shape, not a
      // harmless no-op. Not a sampling param (doesn't affect determinism the
      // way temperature would) — see JARVIS_EFFORT's doc comment for why an
      // explicit cap is needed on a model where thinking is
      // adaptive-by-default at "high" and draws from the same max_tokens
      // budget as the visible reply.
      ...(JARVIS_EFFORT_CAPABLE_BRAINS.has(model)
        ? { output_config: { effort: options?.effort ?? JARVIS_EFFORT } }
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
      const runner = this.runnerFactory(params, { signal });

      for await (const messageStream of runner) {
        // Indices are scoped to ONE messageStream (one API response) — a
        // fresh map every iteration.
        const openToolIndexes = new Map<number, string>();

        for await (const event of messageStream) {
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

        // Recorded once per RUNNER iteration (not once per turn) — a
        // multi-iteration turn (tool round-trips, a pause_turn resume) bills
        // the API once per iteration, so the meter's counts need to match
        // that, not collapse to the turn's final iteration alone. `?? 0`
        // defaults cover both a fixture that omits `usage` and any one of
        // its four sub-counts the real SDK response might not carry.
        if (this.usageMeter) {
          this.usageMeter.recordTokens(model, {
            inputTokens: message.usage?.input_tokens ?? 0,
            outputTokens: message.usage?.output_tokens ?? 0,
            cacheReadTokens: message.usage?.cache_read_input_tokens ?? 0,
            cacheCreationTokens:
              message.usage?.cache_creation_input_tokens ?? 0,
          });
        }

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
      push({ type: "error", message: DESK_LINK_FALTERED_MESSAGE });

      return { kind: "errored" };
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
