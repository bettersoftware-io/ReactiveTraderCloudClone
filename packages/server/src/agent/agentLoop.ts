import type { Observable } from "rxjs";

import {
  DEFAULT_JARVIS_BRAIN,
  JARVIS_BRAINS,
  type JarvisEffort,
  type JarvisEvent,
  type JarvisHistoryEntry,
  type JarvisHouseBrain,
  type JarvisLiveBrain,
  type JarvisProvider,
} from "@rtc/domain";

import type { TurnMeter } from "../services/jarvisBudget/JarvisBudgetService.js";
import type { ServiceContainer } from "../services/serviceContainer.js";
import { ScriptedAgentLoop } from "./ScriptedAgentLoop.js";

/**
 * Where a turn on a person's own key reports that the provider turned the key
 * down. It belongs to one session: once that session is no longer the key's
 * current one, `refused` does nothing, so a failure on an old key cannot
 * refuse a newer one. Absent on a house turn.
 */
export interface OwnKeyFailureSink {
  readonly providerName: string;
  refused(): void;
}

/** The one thing a client hears of a failure that is not its own to act on. */
export const DESK_LINK_FALTERED_MESSAGE =
  "The desk link faltered, sir — do try again.";

/** The turn's error when a provider turns a person's own key down (D13). */
export function describeRefusedKey(providerName: string): string {
  return `${providerName} refused your key.`;
}

interface StatusCarrier {
  readonly status: unknown;
}

interface NumericStatusCarrier {
  readonly status: number;
}

/** The HTTP status a thrown value carries, if it carries one. */
export function hasNumericStatus(
  value: unknown,
): value is NumericStatusCarrier {
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
export function describeSdkErrorForLogging(error: unknown): string {
  const name = error instanceof Error ? error.constructor.name : typeof error;

  return hasNumericStatus(error) ? `${name} (status ${error.status})` : name;
}

/**
 * Per-turn brain/effort selection, threaded from the wire's `jarvis.chat`
 * payload down to whichever `AgentSession` is serving the connection.
 * `brain` excludes `"scripted"` — resolving to "scripted" means the turn
 * never reaches an `AnthropicAgentSession` at all: `jarvisEffects`' routing
 * sends a scripted pick to `JarvisLoops.scripted` instead, so by the time an
 * `AnthropicAgentSession` sees this, the brain has already been resolved and
 * validated to a live model upstream (the wire layer's job, not this seam's):
 * a house brain, or an own brain on the curated list. `ScriptedAgentSession`
 * accepts this param only to satisfy the shared `AgentSession` surface — it
 * ignores it entirely, since the scripted engine has no notion of model or
 * effort.
 */
export interface JarvisTurnOptions {
  readonly brain?: JarvisLiveBrain;
  readonly effort?: JarvisEffort;
  /** The turn's budget: every model request is recorded into it, and it is
   * asked before every further request whether the budget is spent. Absent,
   * nothing is recorded and nothing stops the turn early. */
  readonly meter?: TurnMeter;
  /** Set on a turn that runs on a person's own key. */
  readonly keyFailure?: OwnKeyFailureSink;
}

/**
 * One turn-serving handle over a single WS connection's conversation.
 * `AgentLoop.createSession()` mints a fresh `AgentSession` per socket — the
 * P3 fix for the P2 cross-socket confirmation-forgery risk, since each
 * session now owns its own pending-confirmation state instead of sharing one
 * process-wide map keyed only by an unguessable id.
 */
export interface AgentSession {
  runTurn(
    text: string,
    history: readonly JarvisHistoryEntry[],
    options?: JarvisTurnOptions,
  ): Observable<JarvisEvent>;
  resolveConfirmation(confirmationId: string, approved: boolean): void;
  /** Abort the in-flight turn (cancel frame / socket close). Idempotent.
   * Cancelling emits no terminal frame for the cancelled turn — the client
   * must have locally completed the turn before sending `jarvis.cancel`
   * (the adapter completes first, cancels fire-and-forget). Turn
   * correlation (only cancelling the turn a `jarvis.cancel` actually names)
   * is the caller's responsibility — see `jarvisEffects`' in-flight-turnId
   * gate — not this method's, which cancels whatever is currently running. */
  cancelTurn(): void;
  dispose(): void;
}

/** The P3 seam: `AnthropicAgentLoop` implements this same surface. */
export interface AgentLoop {
  createSession(): AgentSession;
}

/** Builds a real `AgentLoop` for the Anthropic branch of `createJarvisLoops`'s
 * env precedence — injected rather than imported directly so this module
 * (and its tests) never need the Anthropic SDK. `undefined` until `index.ts`
 * wires the real builder in. */
export type AnthropicLoopBuilder = (
  env: NodeJS.ProcessEnv,
  services: ServiceContainer,
) => AgentLoop;

/** Builds the loop of one accepted own key, at a connection's first turn on
 * it. The key reaches it only through `ConnectionOwnKey.use`. */
export type OwnKeyLoopBuilder = (
  provider: JarvisProvider,
  key: string,
) => AgentLoop;

/**
 * The two house `AgentLoop`s a connection can route a `jarvis.chat` turn to,
 * plus the picker metadata `jarvisEffects`' availability responder and
 * routing both need. `scripted` is always present — it's free (no network
 * call, no API key) — while `anthropic` is `null` whenever the house key
 * reaches no live Claude model (`RTC_JARVIS_FAKE=1`, or no
 * `ANTHROPIC_API_KEY`). `brains`/`defaultBrain` are the picker's house offer:
 * `["scripted"]` alone when `anthropic` is absent, or all four
 * `JARVIS_BRAINS` (in picker order) once a live model is wired. An own key's
 * brains are per connection and join the offer in `jarvisEffects`.
 */
export interface JarvisLoops {
  readonly scripted: AgentLoop;
  readonly anthropic: AgentLoop | null;
  readonly brains: readonly JarvisHouseBrain[];
  readonly defaultBrain: JarvisHouseBrain;
}

/**
 * Env precedence: `RTC_JARVIS_FAKE=1` wins even when `ANTHROPIC_API_KEY` is
 * also set (an explicit rehearsal override, e.g. a demo fallback one env var
 * away without unsetting the key) — the scripted-only shape, offering only
 * `"scripted"`; otherwise a present key selects the dual-loop shape, offering
 * every `JARVIS_BRAINS` entry with `DEFAULT_JARVIS_BRAIN` as the picker
 * default; with no house key it is the scripted-only shape again, so Jarvis
 * stays up and a person's own key still works (D16).
 *
 * `buildAnthropicLoop` is the seam that keeps this module (and its tests)
 * free of the Anthropic SDK: `undefined` here, so a present key without a
 * builder falls through to the scripted-only shape with a single warning
 * instead of silently pretending to be online.
 */
export function createJarvisLoops(
  env: NodeJS.ProcessEnv,
  services: ServiceContainer,
  buildAnthropicLoop?: AnthropicLoopBuilder,
): JarvisLoops {
  if (env.RTC_JARVIS_FAKE !== "1" && env.ANTHROPIC_API_KEY) {
    if (buildAnthropicLoop) {
      return {
        scripted: new ScriptedAgentLoop(services),
        anthropic: buildAnthropicLoop(env, services),
        brains: JARVIS_BRAINS,
        defaultBrain: DEFAULT_JARVIS_BRAIN,
      };
    }

    console.warn("ANTHROPIC_API_KEY set but the Anthropic loop is not wired");
  }

  return {
    scripted: new ScriptedAgentLoop(services),
    anthropic: null,
    brains: ["scripted"],
    defaultBrain: "scripted",
  };
}
