import type { JarvisHistoryEntry, JarvisLiveBrain } from "@rtc/domain";

import type { TurnMeter } from "../services/jarvisBudget/JarvisBudgetService.js";
import type { JarvisTokenUsage } from "../services/UsageMeter.js";
import { describeSdkErrorForLogging } from "./agentLoop.js";
import {
  JARVIS_HISTORY_MAX_MESSAGES,
  JARVIS_MAX_TOKENS_PER_TURN,
  JARVIS_RESERVE_INPUT_TOKENS,
} from "./jarvisRunnerConfig.js";

/**
 * The rules every live model session keeps, whichever provider it talks to:
 * how a request is reserved against the budget, what a broken meter means,
 * which statuses refuse a key, and how much history a turn replays. SDK-free.
 */

/** What one request is reserved at against the budget while it is in flight
 * — see `JARVIS_RESERVE_INPUT_TOKENS`. It never carries a reported cost, so a
 * reservation is always priced from the list. */
export const REQUEST_CEILING: JarvisTokenUsage = {
  inputTokens: JARVIS_RESERVE_INPUT_TOKENS,
  outputTokens: JARVIS_MAX_TOKENS_PER_TURN,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

/** What a provider answers for a key it will not serve: unauthorized, out of
 * credit, forbidden. A 429 is not one of them: the key may be fine. */
export const KEY_REFUSAL_STATUSES: ReadonlySet<number> = new Set([
  401, 402, 403,
]);

/** Asks the meter whether the budget is spent; a meter that throws counts as
 * spent, so a broken budget never lets a turn run on unchecked. `session`
 * names the session in the log line. */
export function isBudgetSpent(meter: TurnMeter, session: string): boolean {
  try {
    return meter.exhausted();
  } catch (error) {
    console.error(
      `${session}: meter.exhausted threw —`,
      describeSdkErrorForLogging(error),
    );

    return true;
  }
}

/**
 * Books a request's usage. Own try/catch: by the time this runs the request
 * was already billed by the provider and, on the normal path, its reply
 * already streamed, so a throwing meter (a bug in the budget or the usage
 * display, an injected test double gone wrong) must never reach the turn's
 * own catch — that would turn an already-served turn into a sanitized "desk
 * link faltered" error AND drop it from the session's history (`runTurn`
 * appends only on a "completed" outcome), corrupting the NEXT turn's context
 * for a failure that has nothing to do with the model or the conversation.
 */
export function recordSafely(
  meter: TurnMeter,
  brain: JarvisLiveBrain,
  usage: JarvisTokenUsage,
  session: string,
): void {
  try {
    meter.record(brain, usage);
  } catch (usageError) {
    console.error(
      `${session}: meter.record threw —`,
      describeSdkErrorForLogging(usageError),
    );
  }
}

/** One replayed history message, in the shape both providers' APIs take. */
export interface HistoryMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export function historyMessageOf(entry: JarvisHistoryEntry): HistoryMessage {
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
export function capMessages<M extends { readonly role: string }>(
  messages: readonly M[],
): M[] {
  const capped =
    messages.length > JARVIS_HISTORY_MAX_MESSAGES
      ? messages.slice(-JARVIS_HISTORY_MAX_MESSAGES)
      : [...messages];

  while (capped[0]?.role === "assistant") {
    capped.shift();
  }

  return capped;
}
