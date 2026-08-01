/**
 * Cost-hygiene knobs for the Anthropic-backed Jarvis loop (Task 6+). Every
 * live turn is a real, metered API call — unlike the scripted
 * (`RTC_JARVIS_FAKE=1`) branch, which is free — so these exist to put a hard
 * ceiling on what an unbounded chat session or a runaway tool loop can cost,
 * not to tune quality.
 */

/**
 * Pinned rather than left to an env var or a "latest" alias: a silent
 * upstream model swap would silently change both latency and per-token cost
 * (and, since a system-prompt tweak can shift model behavior, could also
 * regress the confirmation-before-execution guarantee), so the model in use
 * is a deliberate, reviewed choice, not floating.
 */
export const JARVIS_MODEL_ID = "claude-opus-5";

/**
 * Caps the API's own `max_tokens` per turn. Without a ceiling a single reply
 * (or a model that starts padding) has no upper bound on its own generation
 * cost; 4,096 is comfortably above the 2-4 sentence replies the persona
 * asks for, so it never truncates a real answer while still bounding the
 * worst case.
 */
export const JARVIS_MAX_TOKENS_PER_TURN = 4_096;

/**
 * Caps how many agentic turns (tool-call round-trips) one session may run
 * before the loop force-stops it. Bounds a session that gets stuck
 * re-calling tools in a loop (a misbehaving model, a persistently failing
 * tool) from turning into an unbounded string of billed API calls.
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
