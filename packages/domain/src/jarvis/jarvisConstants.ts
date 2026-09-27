/** Jarvis's copy, caps and cadences. The suites in `@rtc/core-contract`
 * assert them, and that package may not import `@rtc/client-core` — hence
 * here (pluggable-core slice 7 wave 2, the `workspaceLimits` precedent). */

/** How long a confirmation card counts down before it declines itself. */
export const JARVIS_CONFIRM_TIMEOUT_MS: number = 60_000;

/** The transcript's seed entry. */
export const JARVIS_GREETING: string =
  "Good morning, sir. J.A.R.V.I.S online — all trading systems nominal. " +
  "I can quote the majors, report the movers, brief you on the desk, or execute FX orders. How may I assist?";

/** The literal prefix a `narrate()` prompt carries (the narrator's pinned
 * prompt format). `narrate()` strips it for the transcript's DISPLAY text
 * but forwards the prompt unchanged, prefix included, to `port.ask` as the
 * wire text — see `JarvisIntents.narrate`'s doc. */
export const JARVIS_NARRATION_PREFIX: string = "[narration] ";

/** How long a successful narration silences the channel. Measured on the
 * core's own clock (an injected scheduler or the fake-timer-aware
 * `Date.now()`), so the gate is deterministic under virtual time. */
export const NARRATION_COOLDOWN_MS: number = 300_000;

/** Hard per-session cap: the 5th surviving anomaly, and every one after it,
 * is dropped for good, however long it has been since the last narration.
 * There is no reset — the narrator lives for the whole session. */
export const MAX_NARRATIONS_PER_SESSION: number = 4;

/** How long the demo pauses between one step settling and the next step's
 * `sendScripted` — the visible "beat" that gives a viewer time to read what
 * just happened. Collapses to 0 under power-saver `"freeze"` (read fresh per
 * step), the same motion-free guarantee as `DRIVE_STAGGER_MS`. */
export const DEMO_STEP_BEAT_MS: number = 1200;

/** Upper bound on how long ONE demo step may wait for its turn to settle
 * before the whole demo aborts to idle — the same path an errored turn
 * takes. It exists because `sendScripted` is a SILENT no-op while Jarvis is
 * unavailable: no entry pair appears and no event arrives, so a WS
 * disconnect mid-demo would otherwise pin `running` at `true` forever (and,
 * on the step that closes the overlay, leave it closed). Measured from the
 * step's send; 30 s is well above any real scripted turn and short enough
 * that a stuck demo heals inside one viewing. */
export const DEMO_STEP_TIMEOUT_MS: number = 30_000;
