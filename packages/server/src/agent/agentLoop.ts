import type { Observable } from "rxjs";

import {
  DEFAULT_JARVIS_BRAIN,
  JARVIS_BRAINS,
  type JarvisBrain,
  type JarvisEffort,
} from "@rtc/domain";
import type { JarvisEvent, JarvisHistoryEntry } from "@rtc/shared";

import type { ServiceContainer } from "../services/serviceContainer.js";
import { ScriptedAgentLoop } from "./ScriptedAgentLoop.js";

/**
 * Per-turn brain/effort selection, threaded from the wire's `jarvis.chat`
 * payload down to whichever `AgentSession` is serving the connection.
 * `brain` excludes `"scripted"` — resolving to "scripted" means the turn
 * never reaches an `AnthropicAgentSession` at all: `jarvisEffects`' routing
 * sends a scripted pick to `JarvisLoops.scripted` instead, so by the time an
 * `AnthropicAgentSession` sees this, the brain has already been resolved and
 * validated to a live Claude model upstream (the wire layer's job, not this
 * seam's). `ScriptedAgentSession` accepts this param only to satisfy the
 * shared `AgentSession` surface — it ignores it entirely, since the scripted
 * engine has no notion of model or effort.
 */
export interface JarvisTurnOptions {
  readonly brain?: Exclude<JarvisBrain, "scripted">;
  readonly effort?: JarvisEffort;
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

/**
 * The two brain-serving `AgentLoop`s a connection can route a `jarvis.chat`
 * turn to, plus the picker metadata `jarvisEffects`' availability responder
 * and routing both need. `scripted` is always present — it's free (no
 * network call, no API key) — while `anthropic` is `null` whenever no live
 * Claude model is reachable (`RTC_JARVIS_FAKE=1`, or no `ANTHROPIC_API_KEY`).
 * `brains`/`defaultBrain` are the picker's offered set: `["scripted"]` alone
 * when `anthropic` is absent, or all four `JARVIS_BRAINS` (in picker order)
 * once a live model is wired.
 */
export interface JarvisLoops {
  readonly scripted: AgentLoop;
  readonly anthropic: AgentLoop | null;
  readonly brains: readonly JarvisBrain[];
  readonly defaultBrain: JarvisBrain;
}

/**
 * Env precedence: `RTC_JARVIS_FAKE=1` wins even when `ANTHROPIC_API_KEY` is
 * also set (an explicit rehearsal override, e.g. a demo fallback one env var
 * away without unsetting the key) — the scripted-only shape, offering only
 * `"scripted"`; otherwise a present key selects the dual-loop shape, offering
 * every `JARVIS_BRAINS` entry with `DEFAULT_JARVIS_BRAIN` as the picker
 * default; otherwise Jarvis is absent entirely (only the availability
 * responder registers — see `jarvisEffects`).
 *
 * `buildAnthropicLoop` is the seam that keeps this module (and its tests)
 * free of the Anthropic SDK: `undefined` here, so a present key without a
 * builder falls through to `null` with a single warning instead of silently
 * pretending to be online.
 */
export function createJarvisLoops(
  env: NodeJS.ProcessEnv,
  services: ServiceContainer,
  buildAnthropicLoop?: AnthropicLoopBuilder,
): JarvisLoops | null {
  if (env.RTC_JARVIS_FAKE === "1") {
    return {
      scripted: new ScriptedAgentLoop(services),
      anthropic: null,
      brains: ["scripted"],
      defaultBrain: "scripted",
    };
  }

  if (env.ANTHROPIC_API_KEY) {
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

  return null;
}
