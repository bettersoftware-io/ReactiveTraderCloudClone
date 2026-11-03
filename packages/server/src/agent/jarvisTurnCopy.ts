import { JARVIS_TOOL_FRIENDLY_NAMES } from "./jarvisRunnerConfig.js";

/**
 * What a live session says to the person, and the two numbers its turns are
 * bounded and estimated by. SDK-free: every live session shares it, whichever
 * provider it talks to.
 */

/**
 * Caps how many tool-round-trip iterations ONE turn's runner may take
 * (`stop_reason: "pause_turn"` is the one case a session resumes
 * automatically — see the doc comment on `AnthropicAgentSession.runOneTurn`
 * — so without a ceiling a model that keeps pausing a long-running turn
 * could keep the loop resuming it forever). Deliberately its OWN constant
 * rather than reusing `JARVIS_MAX_TURNS_PER_SESSION`: that cap counts
 * SESSION turns (one per user message); this one counts API round-trips
 * WITHIN a single turn — different axes, so conflating them would either
 * make one turn eat the whole session's budget or make the session cap too
 * tight for a legitimately multi-tool-call reply. 8 is generous for a
 * "quote, then trade" style turn while still bounding a stuck loop.
 */
export const JARVIS_RUNNER_MAX_ITERATIONS = 8;

export const REFUSAL_MESSAGE = "I'm afraid I can't assist with that, sir.";
export const SESSION_CAP_MESSAGE =
  "We've had quite the session, sir — do reconnect for a fresh one.";

/** The one thing a client hears of a failure that is not its own to act on. */
export const DESK_LINK_FALTERED_MESSAGE =
  "The desk link faltered, sir — do try again.";

/**
 * Emitted after `cancelTurn()` aborts an in-flight turn. Per the `AgentLoop`
 * seam's doc comment, cancelling guarantees no terminal frame for the
 * cancelled turn — this "error" event is only safe to emit because the
 * client's turnId filter (see `jarvisEffects`' `inFlightTurnId` gate) ignores
 * frames for a turn it no longer considers in flight, so a post-cancel event
 * that does slip through is simply dropped client-side rather than
 * corrupting a later turn's transcript.
 */
export const CANCELLED_MESSAGE = "Cancelled, sir.";

export const TRUNCATION_NOTICE =
  " …that's as far as I can go this turn, sir — do ask me to continue.";

/** Appended when `JARVIS_RUNNER_MAX_ITERATIONS` cuts the runner off while
 * the model still wanted to call a tool or was mid `pause_turn` — see the
 * post-loop check in `runOneTurn`. */
export const RUNWAY_EXHAUSTED_NOTICE =
  " I ran out of runway mid-task, sir — the answer above may be incomplete.";

/** The reply of a turn the daily budget stopped before its first model
 * request (spec §3.3 step 4): there is nothing above it to set it apart from. */
export const BUDGET_SPENT_NOTICE =
  "Today's AI budget is used — switching to the scripted brain.";

/** Ends a turn the daily budget stopped between two model requests: the
 * reply so far stays, and the next turn runs scripted. */
export const BUDGET_STOP_NOTICE = `\n\n${BUDGET_SPENT_NOTICE}`;

/** The rough characters-per-token of English text and JSON, for estimating
 * the usage of a request that never reported its own. */
export const CHARS_PER_TOKEN_ESTIMATE = 4;

export function friendlyToolName(name: string): string {
  return JARVIS_TOOL_FRIENDLY_NAMES[name] ?? name;
}
