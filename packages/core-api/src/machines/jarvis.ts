import type { Direction, JarvisBrain, JarvisSkin } from "@rtc/domain";
import type { JarvisAvailabilityGate, JarvisEvent } from "@rtc/shared";

import type { Machine } from "#/machine";
import type { DriveOutcome } from "#/machines/jarvisDriver";
import type { Stream } from "#/stream";

export type JarvisRole = "user" | "jarvis";

export interface JarvisEntry {
  readonly id: number;
  readonly role: JarvisRole;
  readonly text: string;
  /** false while deltas are still streaming into this entry */
  readonly done: boolean;
  readonly tool?: {
    readonly name: string;
    readonly status: "running" | "done";
  };
  /** `"narrator"` is set on the USER-side entry of a `narrate()` turn — the
   * proactive app-driving narrator dispatched this turn unsolicited, rather
   * than the user typing it. `"system"` marks a machine-generated JARVIS-role
   * entry with no corresponding turn at all — currently only the
   * budget-downgrade line `availabilityPatches$` appends (see
   * `JarvisState.gate`'s doc). Absent (not `false`) on every ordinary
   * `send()` turn's entries. */
  readonly origin?: "narrator" | "system";
}

export interface JarvisConfirmation {
  readonly confirmationId: string;
  readonly symbol: string;
  readonly direction: Direction;
  readonly notional: number;
  readonly quotedPrice: number;
  /** Display precision for quotedPrice — CurrencyPair.ratePrecision, so the
   * confirm card formats exactly like the price tiles. */
  readonly ratePrecision: number;
  /** 1 → just requested, 0 → expired; ticks down once per second */
  readonly remainingFraction: number;
}

export interface JarvisState {
  readonly open: boolean;
  readonly skin: JarvisSkin;
  readonly unread: number;
  /** Set when a `narrate()` turn completes while `open` is false; NOT set
   * when a narrate turn completes while open (unlike `unread`, which still
   * counts either way — the narrator flare is specifically "JARVIS spoke up
   * unprompted while you weren't looking"). Cleared by `open()` (and by
   * `toggle()` opening, mirroring `unread`'s own open-clears-it rule). */
  readonly unreadNarration: boolean;
  readonly phase: "idle" | "speaking";
  readonly entries: readonly JarvisEntry[];
  readonly pendingConfirmation: JarvisConfirmation | null;
  /** Live availability of the Jarvis backend; always true in sim mode
   * (deps.availability$ defaults to an always-available, scripted-only
   * value — see `createJarvisMachine`). `send()` while false is a silent
   * no-op — no user entry is appended and `port.ask` is never called. Both
   * web clients read it: `JarvisOrb` renders `null` and `useJarvisHotkey`
   * disarms ⌘/Ctrl+J while it is false. */
  readonly available: boolean;
  /** Brains currently on offer, per the live `availability$` feed (or the
   * sim-mode default's scripted-only offering). An empty array is a normal
   * value (nothing offered right now), not a nullish sentinel — see
   * `JarvisAvailability`'s doc. */
  readonly brains: readonly JarvisBrain[];
  /** The brain this session's turns actually run with: the user's
   * preferred brain (`JarvisDeps.preferredBrain$`) when it's among
   * `brains`, else `availability`'s own `defaultBrain`. Re-resolved on
   * every `preferredBrain$` emission AND every `availability$` emission
   * (an availability flip can un-offer the currently-preferred brain
   * mid-session). */
  readonly effectiveBrain: JarvisBrain;
  /** The active usage-budget gate, mirrored verbatim from the live
   * `availability$` feed's own `gate` field on every emission (`null` when
   * none is active, including sim mode's always-`null` default). Distinct
   * from `effectiveBrain`: a gate can be active without moving THIS user's
   * effective brain (e.g. a soft gate that only removes brains they weren't
   * using) — see `availabilityPatches$`'s doc for how the two are folded
   * together, and the one system-line entry a gate that DOES move
   * `effectiveBrain` appends into `entries`. */
  readonly gate: JarvisAvailabilityGate | null;
  /** Times the overlay has been opened this session — the chip-rotation
   * seed. Increments only on a closed→open transition, via `open()` or the
   * opening branch of `toggle()`; never on `close()`, and never on a
   * repeated `open()` call while already open. `0` in `INITIAL`. */
  readonly openCount: number;
}

export interface JarvisIntents {
  open: () => void;
  close: () => void;
  toggle: () => void;
  send: (text: string) => void;
  /** Dispatches an UNSOLICITED turn — the proactive app-driving narrator's
   * entry point (`NarratorMachine`, a later task), not a user action. Enters
   * the SAME turn queue as `send` (a narrate arriving while a send is still
   * in flight queues behind it, per the shared `concatMap`), and is the same
   * silent no-op as `send` while `state.available` is false. `prompt` is
   * expected to carry the literal `JARVIS_NARRATION_PREFIX` — it rides
   * unchanged to `port.ask` as the wire text, while the transcript's
   * user-side entry displays it WITHOUT that prefix and flagged
   * `origin: "narrator"`. */
  narrate: (prompt: string) => void;
  /** Queue a turn pinned to the scripted brain — the demo's send; the
   * user's brain preference is untouched. Enters the SAME turn queue as
   * `send`/`narrate` (a `sendScripted` arriving while another turn is still
   * in flight queues behind it, per the shared `concatMap`), is the same
   * silent no-op as `send` while `state.available` is false, and produces
   * an ordinary user-role entry — `origin` is left unset, exactly like
   * `send`'s. Only the brain the turn's `port.ask` call carries differs. */
  sendScripted: (text: string) => void;
  approveConfirmation: () => void;
  declineConfirmation: () => void;
  setSkin: (skin: JarvisSkin) => void;
  /** Folds one `DriveOutcome` (`JarvisDriverMachine`'s per-command result,
   * not a user action) into the transcript: an `"applied"` outcome appends
   * a new jarvis-role entry with text `` `drive: ${outcome.command.kind}` ``
   * (e.g. "drive: switchTab"); a `"skipped"` outcome folds NOTHING — the
   * filter lives in THIS machine's fold (not at the `outcomes$` source) so
   * a future consumer that wants skipped outcomes too (e.g. a debug view)
   * isn't already filtered upstream. No turn correlation: the entry appends
   * at arrival, independent of `phase`/any in-flight `send`/`narrate` turn,
   * mirroring how `toolEvent`/`done` entries append at arrival too.
   * `composition.ts` wires this from `jarvisDriver.outcomes$` AFTER both
   * machines exist (a late-bound subscription — `jarvisDriver` is built
   * FROM this machine's own `events$`, so this machine can't depend on
   * `jarvisDriver`'s output at CONSTRUCTION time without a cycle). */
  recordDriveOutcome: (outcome: DriveOutcome) => void;
}

/** `createJarvisMachine`'s return, widened with `events$` — every reply
 * event from every turn (`port.ask()` call), across the machine's whole
 * session lifetime. Task 6's sole event source for
 * `JarvisPanelsMachine` (composition.ts wires it in): panel events ride the
 * same per-turn `JarvisEvent` stream as everything else `ask()` emits (this
 * machine's own `"panel"` case is a deliberate no-op — see its doc above),
 * and this is the one place that stream is exposed outside the
 * turn-sequencing internals. Callers MUST catchError-guard this before
 * handing it to `createJarvisPanelsMachine`: that machine's `events$` input
 * is TERMINAL on error (kills its fold), and nothing here narrows what
 * `port.ask()` could do. */
export interface JarvisMachineHandle
  extends Machine<JarvisState, JarvisIntents> {
  readonly events$: Stream<JarvisEvent>;
}
