import type { JarvisBrain } from "@rtc/domain";

/**
 * Cost-hygiene knobs for the Anthropic-backed Jarvis loop (Task 6+). Every
 * live turn is a real, metered API call — unlike the scripted
 * (`RTC_JARVIS_FAKE=1`) branch, which is free — so these exist to put a hard
 * ceiling on what an unbounded chat session or a runaway tool loop can cost,
 * not to tune quality.
 */

/**
 * Caps the API's own `max_tokens` per turn. Without a ceiling a single reply
 * (or a model that starts padding) has no upper bound on its own generation
 * cost; 4,096 is comfortably above the 2-4 sentence replies the persona
 * asks for, so it never truncates a real answer while still bounding the
 * worst case.
 */
export const JARVIS_MAX_TOKENS_PER_TURN = 4_096;

/**
 * Brains whose Anthropic request may carry `output_config.effort` — a
 * capability SET rather than a per-model-name conditional in
 * `AnthropicAgentSession`, so a future brain that also supports adaptive
 * effort is added here once instead of at every call site that branches on
 * it. `"claude-haiku-4-5"` is deliberately excluded: it predates the
 * `effort` request parameter, so sending one to the API for that model
 * would be an unvalidated request-shape change, not a harmlessly-ignored
 * no-op — `@rtc/domain`'s `DEFAULT_JARVIS_EFFORT` (the default effort
 * value, used at the one call site that reads this set —
 * `AnthropicAgentSession.runOneTurn`) stays applicable only to the brains
 * listed here. No local `JARVIS_EFFORT` constant lives in this file: the
 * default effort value has exactly one source of truth, `@rtc/domain`'s
 * `DEFAULT_JARVIS_EFFORT` (the same constant the preferences UI defaults
 * to), imported directly at its one consumption site rather than re-pinned
 * here under a second name.
 */
export const JARVIS_EFFORT_CAPABLE_BRAINS: ReadonlySet<JarvisBrain> = new Set([
  "claude-sonnet-5",
  "claude-opus-5",
]);

/**
 * Caps how many user-message turns one session may run before the loop
 * force-stops it (distinct from `JARVIS_RUNNER_MAX_ITERATIONS`, which caps
 * the tool-call round-trips *within* a single turn). Bounds a session that
 * gets stuck re-calling tools in a loop (a misbehaving model, a persistently
 * failing tool) from turning into an unbounded string of billed API calls.
 */
export const JARVIS_MAX_TURNS_PER_SESSION = 40;

/**
 * Caps how much prior conversation is replayed into each new turn's
 * context. Every history message sent is billed input tokens on every
 * subsequent turn, so an unbounded history makes a long-running
 * conversation's per-turn cost grow without bound; 30 keeps enough context
 * for a coherent conversation while capping that growth.
 */
export const JARVIS_HISTORY_MAX_MESSAGES = 30;

/**
 * Short chip labels the UI shows while a tool call is in flight, keyed by
 * the tool name `@rtc/agent-tools`' `buildJarvisTools` exports. Exists
 * separately from the tool descriptions (which are prompt content, sized
 * for the model) because a UI chip needs a one-word label, not a sentence —
 * conflating the two would mean either bloating the prompt with UI concerns
 * or truncating the model-facing description to fit a chip.
 */
export const JARVIS_TOOL_FRIENDLY_NAMES: Record<string, string> = {
  get_price: "quote",
  get_price_history: "history",
  get_blotter: "desk",
  get_analytics: "desk",
  list_currency_pairs: "refdata",
  get_service_health: "health",
  execute_trade: "trade",
};
