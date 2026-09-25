/**
 * The Jarvis machine's synchronous rules, free of any stream library: the
 * state patches, the per-session scalars (entry ids, the in-flight turn,
 * availability, brain, effort) and the model-facing history. The RxJS
 * `createJarvisMachine` is a shell over it, and the alternative application
 * cores import it rather than re-implementing it (pluggable-core slice 7
 * wave 2, ruling 2 — "pure reducers are imported, not duplicated"). Each
 * core keeps only the timing: the serial turn queue, the countdown timer and
 * the preference subscriptions.
 */
import type {
  DriveOutcome,
  JarvisAskOptions,
  JarvisAvailability,
  JarvisConfirmation,
  JarvisEntry,
  JarvisPort,
  JarvisState,
} from "@rtc/core-api";
import {
  DEFAULT_JARVIS_BRAIN,
  DEFAULT_JARVIS_EFFORT,
  DEFAULT_JARVIS_SKIN,
  JARVIS_BRAIN_LABELS,
  JARVIS_BRAINS,
  JARVIS_GREETING,
  JARVIS_NARRATION_PREFIX,
  type JarvisBrain,
  type JarvisEffort,
  type JarvisSkin,
} from "@rtc/domain";
import type { JarvisEvent, JarvisHistoryEntry } from "@rtc/shared";

/** Strip `JARVIS_NARRATION_PREFIX` from a narrate prompt for display; a
 * prompt without the prefix passes through unchanged (defensive — every
 * real caller is `NarratorMachine`, which always includes it). */
function stripNarrationPrefix(prompt: string): string {
  return prompt.startsWith(JARVIS_NARRATION_PREFIX)
    ? prompt.slice(JARVIS_NARRATION_PREFIX.length)
    : prompt;
}

/** One state change. Every core applies these to its own container (RxJS
 * `scan`, the async core's `Store.set`, the Effect core's `SyncRef`).
 *
 * Apply each patch EXACTLY ONCE, in order, and never inside an update that
 * may retry: several have effects at apply time — `approvePatch`,
 * `declinePatch` and the countdown's expiry call the port, and the budget
 * line allocates an entry id — so a replayed patch would confirm a trade
 * twice or skip an id. */
export type JarvisPatch = (s: JarvisState) => JarvisState;

const GREETING_ENTRY: JarvisEntry = {
  id: 0,
  role: "jarvis",
  text: JARVIS_GREETING,
  done: true,
};

export const JARVIS_INITIAL_STATE: JarvisState = {
  open: false,
  skin: DEFAULT_JARVIS_SKIN,
  unread: 0,
  unreadNarration: false,
  phase: "idle",
  entries: [GREETING_ENTRY],
  pendingConfirmation: null,
  available: true,
  brains: JARVIS_BRAINS,
  effectiveBrain: DEFAULT_JARVIS_BRAIN,
  gate: null,
  openCount: 0,
};

/** Sim-mode / legacy-caller default for `JarvisDeps.availability$`: always
 * available, offering only the scripted (offline) brain — matches
 * `ScriptedJarvisAdapter`'s actual capability, unlike `JARVIS_INITIAL_STATE.brains`
 * (which offers every selectable brain before any real availability
 * feed has resolved). */
export const JARVIS_SIM_AVAILABILITY: JarvisAvailability = {
  available: true,
  brains: ["scripted"],
  defaultBrain: "scripted",
  gate: null,
};

/** Resolves which brain a turn actually runs with: the preferred brain when
 * it's among the ones currently on offer, else the availability feed's own
 * default. `availability.brains` is trusted as-is — an empty array (nothing
 * offered) falls through to `defaultBrain` the same as any other
 * not-offered case; no separate check on `availability.available` is
 * needed here (see `JarvisAvailability`'s "key everything off `available`"
 * doc — that's a caution for CONSUMERS of `state.available`, not a
 * precondition this resolver needs to duplicate). */
function resolveEffectiveBrain(
  preferredBrain: JarvisBrain,
  availability: JarvisAvailability,
): JarvisBrain {
  return availability.brains.includes(preferredBrain)
    ? preferredBrain
    : availability.defaultBrain;
}

/** Locale `HH:MM` rendering of a gate's `resetsAtMs` (e.g. the footer chip,
 * the picker's disabled-row reset copy, and the budget-downgrade system
 * line below all share this one formatting rule). `0` is the meter's
 * "forced gate on a fresh window" sentinel — see `JarvisAvailabilityGate`'s
 * doc — rendered as "—" rather than the 1970 epoch a naive `Date(0)` would
 * produce. */
export function formatGateResetTime(resetsAtMs: number): string {
  if (resetsAtMs === 0) {
    return "—";
  }

  return new Date(resetsAtMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The budget-downgrade system line's trailing clause: empty for the `0`
 * sentinel (the line reads "...continuing on Haiku 4.5." with no dangling
 * "until —"), else " until HH:MM". */
function untilClause(resetsAtMs: number): string {
  return resetsAtMs === 0 ? "" : ` until ${formatGateResetTime(resetsAtMs)}`;
}

/** The transcript text a folded `DriveOutcome` reads as — `"applied"` →
 * `drive: <kind>`; `"refused"` → `can't <op>: <reason>` (`op` is the layout
 * command's own `op` for kind `"layout"`, else the command's `kind`). Only
 * called for the two statuses `recordDriveOutcome`'s fold keeps. */
function formatDriveOutcomeText(outcome: DriveOutcome): string {
  if (outcome.status !== "refused") {
    return `drive: ${outcome.command.kind}`;
  }

  const op =
    outcome.command.kind === "layout"
      ? outcome.command.op
      : outcome.command.kind;
  return `can't ${op}: ${outcome.reason ?? "refused"}`;
}

/** The budget-gate copy the Preferences Brain row shows, shared by both web
 * clients: the hint line under the row AND each gated option's tooltip, so
 * the two never drift apart. `0` drops the reset clause, the same rule
 * `untilClause` applies to the downgrade line, rather than printing
 * "resets —". */
export function formatGateHint(resetsAtMs: number): string {
  return resetsAtMs === 0
    ? "Budget window active"
    : `Budget window — resets ${formatGateResetTime(resetsAtMs)}`;
}

/** The Brain row's hint line, or `undefined` when there is nothing to say.
 * Leads with the gate copy while a gate is active, and names the running
 * brain whenever it is not the one the user saved: under a gate that moved
 * them ("paused" — it resumes when the window resets), or because the
 * server does not offer it at all (simulator mode runs only `scripted`).
 * The picker keeps highlighting the saved choice either way, so this line
 * is where the running brain is shown. */
export function formatBrainHint(
  gate: JarvisState["gate"],
  preferred: JarvisBrain,
  effective: JarvisBrain,
): string | undefined {
  const moved = preferred !== effective;

  if (gate === null) {
    return moved
      ? `${JARVIS_BRAIN_LABELS[preferred]} isn't available — using ${JARVIS_BRAIN_LABELS[effective]}`
      : undefined;
  }

  const fallback = moved
    ? ` · ${JARVIS_BRAIN_LABELS[preferred]} paused, using ${JARVIS_BRAIN_LABELS[effective]}`
    : "";

  return `${formatGateHint(gate.resetsAtMs)}${fallback}`;
}

/** Fold `fn` onto the entry with the given `id` — the streaming/accumulating
 * entry `turnItems$`'s concatMap allocated for the CURRENT in-flight turn
 * (tracked by `entryPatches$`, cleared on that turn's own done/error — see
 * its doc). Targeting by id, not "the last entry" (this function's
 * predecessor, `updateLastEntry`), matters because an UNRELATED source can
 * append a new entry mid-turn — `availabilityPatches$`'s budget-downgrade
 * system line and `driveOutcomePatches$`'s drive row both do, and either
 * can land between two deltas of an in-flight turn (the gate line in
 * particular: the server pushes the availability frame synchronously off
 * the very turn's own `recordTokens`, so this is the MODAL path, not an
 * edge case). Under "the last entry", that appended row becomes the new
 * tail and hijacks every subsequent delta/toolEvent/done/error meant for
 * the real streaming entry — its text glues onto the notice/drive row, and
 * the real entry never gets its `done: true`, stuck spinning forever.
 * Targeting by id sidesteps this by construction: an append changes what's
 * LAST but never what MATCHES the tracked id. A missing `id` (no turn in
 * flight) or an id no longer present is a no-op, mirroring
 * `updateLastEntry`'s own defensive empty-array return. */
function updateEntryById(
  entries: readonly JarvisEntry[],
  id: number | null,
  fn: (e: JarvisEntry) => JarvisEntry,
): readonly JarvisEntry[] {
  if (id === null) {
    return entries;
  }

  const index = entries.findIndex((e) => {
    return e.id === id;
  });

  if (index === -1) {
    return entries;
  }

  const target = entries[index];

  if (!target) {
    return entries;
  }

  const next = [...entries];
  next[index] = fn(target);
  return next;
}

/** Fold one reply event from an in-flight turn into a state patch.
 * `turnOrigin` is the enclosing turn's origin (set by `turnItems$`'s
 * `concatMap` when it builds each turn's "start" item — see its doc): only
 * `"narrator"`-origin turns bump `unreadNarration` on completion.
 * `entryId` is the in-flight streaming entry's own id, captured by
 * `entryPatches$` at the turn's "start" item — see `updateEntryById`'s doc
 * for why every case below targets by id rather than "the last entry". */
function eventPatch(
  event: JarvisEvent,
  turnOrigin: "narrator" | undefined,
  entryId: number | null,
): JarvisPatch {
  switch (event.type) {
    case "delta":
      return (s: JarvisState): JarvisState => {
        return {
          ...s,
          entries: updateEntryById(s.entries, entryId, (e) => {
            return { ...e, text: e.text + event.text };
          }),
        };
      };

    case "toolEvent":
      return (s: JarvisState): JarvisState => {
        return {
          ...s,
          entries: updateEntryById(s.entries, entryId, (e) => {
            return { ...e, tool: { name: event.tool, status: event.status } };
          }),
        };
      };

    case "done":
      return (s: JarvisState): JarvisState => {
        return {
          ...s,
          phase: "idle",
          unread: s.open ? s.unread : s.unread + 1,
          unreadNarration:
            turnOrigin === "narrator" && !s.open ? true : s.unreadNarration,
          entries: updateEntryById(s.entries, entryId, (e) => {
            return { ...e, done: true };
          }),
        };
      };

    case "error":
      return (s: JarvisState): JarvisState => {
        return {
          ...s,
          phase: "idle",
          unread: s.open ? s.unread : s.unread + 1,
          unreadNarration:
            turnOrigin === "narrator" && !s.open ? true : s.unreadNarration,
          // Drop `tool` entirely rather than leaving it at whatever status a
          // prior toolEvent left it in: a later sequential snapshot read
          // (e.g. ScriptedJarvisAdapter's pnl/movers turns) can still time
          // out into an error after toolEvent(running) already landed, and
          // without clearing it the finalized entry would show error text
          // alongside a permanently-stuck "running" badge.
          entries: updateEntryById(s.entries, entryId, (e) => {
            const { tool: _tool, ...rest } = e;
            return { ...rest, text: event.message, done: true };
          }),
        };
      };

    case "confirmRequest":
      return (s: JarvisState): JarvisState => {
        return {
          ...s,
          pendingConfirmation: {
            confirmationId: event.confirmationId,
            symbol: event.symbol,
            direction: event.direction,
            notional: event.notional,
            quotedPrice: event.quotedPrice,
            ratePrecision: event.ratePrecision,
            remainingFraction: 1,
          },
        };
      };

    case "panel":
      // Deliberate no-op: panel events are owned by the separate
      // JarvisPanelsMachine (Task 5), not this chat-state machine.
      return (s: JarvisState): JarvisState => {
        return s;
      };

    case "command":
      // Deliberate no-op, mirroring "panel" above: command batches are
      // applied by a separate drive-the-app machine/adapter (a later P5
      // task), not folded into chat entries here.
      return (s: JarvisState): JarvisState => {
        return s;
      };

    default: {
      const _exhaustive: never = event;

      return (s: JarvisState): JarvisState => {
        return s;
      };
    }
  }
}

/** One request enqueued into the shared turn queue — `send()`, `narrate()`
 * or `sendScripted()`. All three share ONE queue, so any one arriving
 * mid-turn waits behind whichever is in flight. */
export type JarvisTurnRequest =
  | { readonly kind: "send"; readonly text: string }
  | { readonly kind: "sendScripted"; readonly text: string }
  | { readonly kind: "narrate"; readonly prompt: string };

/** What a dequeued turn needs: the wire call and the patch that opens it. */
export interface JarvisTurnPlan {
  /** `narrate()`'s prompt AS GIVEN (prefix included, per
   * `JarvisIntents.narrate`'s doc); `send()`'s text verbatim. */
  readonly wireText: string;
  readonly options: JarvisAskOptions;
  readonly origin: "narrator" | undefined;
  /** Appends the user entry and the empty jarvis stub; `phase: "speaking"`. */
  readonly start: JarvisPatch;
}

/** The session scalars the machine's patches read and write. */
export interface JarvisController {
  /** Call when the turn is DEQUEUED, not when it is requested: `null` while
   * unavailable (the silent no-op — no entry, no `ask`); otherwise allocates
   * both entry ids and marks the jarvis stub in flight, so the turn's events
   * target it. */
  planTurn(req: JarvisTurnRequest): JarvisTurnPlan | null;
  /** Folds one reply event of the in-flight turn; `done`/`error` end it. */
  eventPatch(event: JarvisEvent, origin: "narrator" | undefined): JarvisPatch;
  /** `null` for a `"skipped"` outcome — see
   * `JarvisIntents.recordDriveOutcome`'s doc for why the filter lives here
   * rather than at the driver's `outcomes$`. */
  driveOutcomePatch(outcome: DriveOutcome): JarvisPatch | null;
  availabilityPatch(value: JarvisAvailability): JarvisPatch;
  preferredBrainPatch(brain: JarvisBrain): JarvisPatch;
  setEffort(effort: JarvisEffort): void;
  /** One confirmation-countdown tick. At the last tick the patch declines
   * the card through `confirm` and clears it; before it, the patch lowers
   * `remainingFraction`. Either patch is a no-op — no port call — once a
   * different confirmation, or none, is pending. */
  confirmTickPatch(
    confirmationId: string,
    ticksElapsed: number,
    totalTicks: number,
    confirm: JarvisPort["confirm"],
  ): JarvisPatch;
}

/** Whole seconds a confirmation counts down (at least one). */
export function confirmTotalTicks(timeoutMs: number): number {
  return Math.max(1, Math.round(timeoutMs / 1000));
}

export function openPatch(s: JarvisState): JarvisState {
  return {
    ...s,
    open: true,
    unread: 0,
    unreadNarration: false,
    // Guarded increment: bumps only on a genuine closed→open transition,
    // not on a repeated open() while already open — see
    // JarvisState.openCount's doc.
    openCount: s.open ? s.openCount : s.openCount + 1,
  };
}

export function closePatch(s: JarvisState): JarvisState {
  return { ...s, open: false };
}

export function togglePatch(s: JarvisState): JarvisState {
  const open = !s.open;
  return {
    ...s,
    open,
    unread: open ? 0 : s.unread,
    unreadNarration: open ? false : s.unreadNarration,
    // Only the opening branch bumps — mirrors openPatch's own guarded
    // increment (closing never touches it).
    openCount: open ? s.openCount + 1 : s.openCount,
  };
}

/** The port is the source of truth for the skin: `setSkin()` writes the
 * preference, and `state.skin` only ever changes by following it back. */
export function skinPatch(skin: JarvisSkin): JarvisPatch {
  return (s: JarvisState): JarvisState => {
    return { ...s, skin };
  };
}

/** Approves the pending confirmation through `confirm`, then clears it; a
 * no-op with nothing pending. */
export function approvePatch(confirm: JarvisPort["confirm"]): JarvisPatch {
  return resolveConfirmationPatch(confirm, true);
}

/** Declines the pending confirmation through `confirm`, then clears it; a
 * no-op with nothing pending. */
export function declinePatch(confirm: JarvisPort["confirm"]): JarvisPatch {
  return resolveConfirmationPatch(confirm, false);
}

function resolveConfirmationPatch(
  confirm: JarvisPort["confirm"],
  approved: boolean,
): JarvisPatch {
  return (s: JarvisState): JarvisState => {
    if (!s.pendingConfirmation) {
      return s;
    }

    confirm(s.pendingConfirmation.confirmationId, approved);
    return { ...s, pendingConfirmation: null };
  };
}

function isPending(
  pending: JarvisConfirmation | null,
  confirmationId: string,
): pending is JarvisConfirmation {
  return pending?.confirmationId === confirmationId;
}

export function createJarvisController(): JarvisController {
  // Synchronous caches the turn queue reads at dequeue time. Seeded to match
  // JARVIS_INITIAL_STATE (available, every selectable brain offered), NOT
  // JARVIS_SIM_AVAILABILITY: this is what a same-tick send() reads before
  // the FIRST availability emission lands, and in WS-real mode that first
  // emission is a genuine round-trip (WsAdapter buffers pre-open sends, so a
  // send() in that window is real). Seeding it scripted-only would silently
  // pin brain:"scripted" onto that first turn. Sim mode is unaffected: its
  // fallback availability emits synchronously at construction and corrects
  // these before any send() can fire.
  let available = true;
  let availability: JarvisAvailability = {
    available: true,
    brains: JARVIS_BRAINS,
    defaultBrain: DEFAULT_JARVIS_BRAIN,
    gate: null,
  };
  let preferredBrain: JarvisBrain = DEFAULT_JARVIS_BRAIN;
  let effectiveBrain: JarvisBrain = JARVIS_INITIAL_STATE.effectiveBrain;
  let effort: JarvisEffort = DEFAULT_JARVIS_EFFORT;
  // The CURRENT turn's own streaming jarvis entry id, or `null` when no turn
  // is in flight. Event patches target this id (via updateEntryById) rather
  // than "the last entry" — see updateEntryById's doc: an unrelated mid-turn
  // append (the budget-downgrade system line, a drive-outcome row) would
  // otherwise hijack every following event meant for the streaming entry.
  let inFlightEntryId: number | null = null;
  // One counter for every appended entry (turns, drive outcomes, system
  // lines): ids need to be unique, not contiguous. 0 is the greeting.
  let nextEntryId = 1;

  return {
    planTurn: (req: JarvisTurnRequest): JarvisTurnPlan | null => {
      if (!available) {
        return null;
      }

      const origin: "narrator" | undefined =
        req.kind === "narrate" ? "narrator" : undefined;
      const wireText = req.kind === "narrate" ? req.prompt : req.text;
      const displayText =
        req.kind === "narrate" ? stripNarrationPrefix(req.prompt) : req.text;

      const userEntry: JarvisEntry = {
        id: nextEntryId++,
        role: "user",
        text: displayText,
        done: true,
        ...(origin ? { origin } : {}),
      };

      const jarvisEntry: JarvisEntry = {
        id: nextEntryId++,
        role: "jarvis",
        text: "",
        done: false,
      };
      // sendScripted() pins the turn's brain to "scripted" regardless of
      // effectiveBrain — see JarvisIntents.sendScripted's doc.
      const brain = req.kind === "sendScripted" ? "scripted" : effectiveBrain;

      inFlightEntryId = jarvisEntry.id;

      return {
        wireText,
        options: { brain, effort },
        origin,
        start: (s: JarvisState): JarvisState => {
          return {
            ...s,
            phase: "speaking",
            entries: [...s.entries, userEntry, jarvisEntry],
          };
        },
      };
    },

    eventPatch: (
      event: JarvisEvent,
      origin: "narrator" | undefined,
    ): JarvisPatch => {
      const patch = eventPatch(event, origin, inFlightEntryId);

      // done/error are the turn's terminal events (JarvisPort.ask's own
      // contract): clear the tracked id so a stray later event is a no-op
      // rather than mistargeting the NEXT turn's streaming entry.
      if (event.type === "done" || event.type === "error") {
        inFlightEntryId = null;
      }

      return patch;
    },

    driveOutcomePatch: (outcome: DriveOutcome): JarvisPatch | null => {
      if (outcome.status === "skipped") {
        return null;
      }

      const entry: JarvisEntry = {
        id: nextEntryId++,
        role: "jarvis",
        text: formatDriveOutcomeText(outcome),
        done: true,
      };

      return (s: JarvisState): JarvisState => {
        return { ...s, entries: [...s.entries, entry] };
      };
    },

    // Refreshes the caches the turn queue reads AND re-resolves the
    // effective brain — an availability flip can un-offer the preferred
    // brain mid-session. Also the sole home of the budget-downgrade system
    // line: one availability value produces ONE atomic patch (gate + brains
    // + effectiveBrain + the optional entry), so no intermediate state is
    // ever observable.
    availabilityPatch: (value: JarvisAvailability): JarvisPatch => {
      available = value.available;
      availability = value;
      effectiveBrain = resolveEffectiveBrain(preferredBrain, availability);
      const nextEffectiveBrain = effectiveBrain;
      const gate = value.gate;

      return (s: JarvisState): JarvisState => {
        // Read from the FOLDED state, not a closure snapshot, so the patch
        // stays pure in (s, value) whatever order a core applies it in.
        const previousEffectiveBrain = s.effectiveBrain;
        const base: JarvisState = {
          ...s,
          available: value.available,
          brains: value.brains,
          gate,
          effectiveBrain: nextEffectiveBrain,
        };

        // The line appends only when a gate is active (never on lift), it
        // actually MOVED this session's effective brain (not for an
        // unaffected user, nor a republished frame at the same level), and
        // there is a conversation beyond the greeting to append it to.
        if (
          gate === null ||
          nextEffectiveBrain === previousEffectiveBrain ||
          s.entries.length <= 1
        ) {
          return base;
        }

        const entry: JarvisEntry = {
          id: nextEntryId++,
          role: "jarvis",
          text: `Usage budget reached — continuing on ${JARVIS_BRAIN_LABELS[nextEffectiveBrain]}${untilClause(gate.resetsAtMs)}.`,
          done: true,
          origin: "system",
        };

        return { ...base, entries: [...s.entries, entry] };
      };
    },

    // A preference change mid-session must reach the very next send(), per
    // JarvisState.effectiveBrain's doc.
    preferredBrainPatch: (brain: JarvisBrain): JarvisPatch => {
      preferredBrain = brain;
      effectiveBrain = resolveEffectiveBrain(preferredBrain, availability);

      return (s: JarvisState): JarvisState => {
        return { ...s, effectiveBrain };
      };
    },

    // effort has no JarvisState field of its own — only ask()'s options
    // read it (see JarvisDeps.effort$'s doc).
    setEffort: (value: JarvisEffort): void => {
      effort = value;
    },

    confirmTickPatch: (
      confirmationId: string,
      ticksElapsed: number,
      totalTicks: number,
      confirm: JarvisPort["confirm"],
    ): JarvisPatch => {
      if (ticksElapsed >= totalTicks) {
        // Expiry: auto-decline and clear — only while THIS card is still the
        // pending one. A core whose countdown cancels asynchronously can
        // deliver a last tick after an approve; declining then would send the
        // port a "no" for a trade it was just told "yes".
        return (s: JarvisState): JarvisState => {
          if (!isPending(s.pendingConfirmation, confirmationId)) {
            return s;
          }

          confirm(confirmationId, false);
          return { ...s, pendingConfirmation: null };
        };
      }

      const remainingFraction = 1 - ticksElapsed / totalTicks;

      return (s: JarvisState): JarvisState => {
        if (!isPending(s.pendingConfirmation, confirmationId)) {
          return s;
        }

        return {
          ...s,
          pendingConfirmation: { ...s.pendingConfirmation, remainingFraction },
        };
      };
    },
  };
}

/**
 * Defensive guard, currently UNREACHABLE in production — kept so a natural
 * future refactor doesn't silently reintroduce a double-send bug. Read
 * `wireJarvisHistorySource`'s doc first for why `ask()`'s `historySource()`
 * read is EAGER (runs before `JarvisMachine`'s "start" patch ever appends the
 * new turn's own `[userEntry, jarvisEntry stub]` pair to `state.entries`), so
 * in today's call shape this function's `slice` branch never actually fires:
 * proven by the direct unit test next to this function in
 * `composition.jarvisHistory.test.ts`, which is the ONLY thing currently
 * exercising it (mutate this function and that test goes red; nothing else
 * would notice).
 *
 * Why keep it: `ask()`'s eager read is an incidental consequence of today's
 * call shape, not a documented contract of `WsJarvisAdapter` — wrapping
 * `ask()`'s body in `defer(() => …)` (so `historySource()` is read at
 * SUBSCRIBE time instead, matching how `createJarvisTurnStream` already
 * defers its `ws.send()`) is a natural-looking refactor that would flip the
 * ordering and make this exclusion load-bearing: a history snapshot read at
 * that later point WOULD contain the in-flight turn's own pair, and
 * `WsJarvisAdapter.ask()` already sends that same text separately as
 * `JarvisChatPayload.text` — so echoing it back inside `history` too would
 * hand the model its own newest message twice. Cheaper to keep a guard that
 * costs one array slice per turn than to silently reintroduce that bug the
 * day someone makes `ask()` lazy.
 */
export function historyEntriesExcludingInFlightTurn(
  entries: readonly JarvisEntry[],
): readonly JarvisEntry[] {
  const last = entries[entries.length - 1];
  return last && !last.done ? entries.slice(0, -2) : entries;
}

/** The replay source a port's `setHistorySource` reads: the transcript
 * minus the in-flight turn, minus unfinished or empty entries, minus
 * `origin: "system"` lines (the budget-downgrade line is UI-only
 * bookkeeping the model never produced). Narrator turns and drive-outcome
 * rows stay: the model is party to both. */
export function modelFacingHistory(
  entries: readonly JarvisEntry[],
): readonly JarvisHistoryEntry[] {
  return historyEntriesExcludingInFlightTurn(entries)
    .filter((entry) => {
      return entry.done && entry.text.length > 0 && entry.origin !== "system";
    })
    .map((entry): JarvisHistoryEntry => {
      return { role: entry.role, text: entry.text };
    });
}
