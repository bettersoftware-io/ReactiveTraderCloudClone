/**
 * The Jarvis demo's script and settle rules, free of any stream library:
 * the step table, the state patches, and the synchronous watcher that tells
 * when ONE step's own turn has ended. The RxJS `createJarvisDemoMachine` is
 * a shell over it (the run slot, the beats and the per-step timeout), and
 * the alternative application cores import it rather than re-implementing
 * it (pluggable-core slice 7 wave 2, ruling 2).
 */
import type {
  JarvisDemoState,
  JarvisDemoStep,
  JarvisEntry,
  JarvisState,
} from "@rtc/core-api";
import { DEMO_STEP_BEAT_MS, type PowerSaverLevel } from "@rtc/domain";
import type { JarvisEvent } from "@rtc/shared";

import { JARVIS_GUIDE_CATALOG } from "./jarvisGuideCatalog";

/** Looks up one command string from `JARVIS_GUIDE_CATALOG` by section title
 * + item index, so `JARVIS_DEMO_STEPS` below never re-types a command that
 * already lives in the catalog (and would silently drift from it — a demo
 * step sending stale wording the scripted brain no longer recognizes).
 * Throws — never returns `undefined` — on a miss: a demo step wired to a
 * nonexistent catalog entry must fail LOUD at module load (every importer
 * of this module evaluates `JARVIS_DEMO_STEPS` eagerly), not silently hand
 * an empty string to `sendScripted` at demo-run time. */
export function guideCommand(sectionTitle: string, index: number): string {
  const section = JARVIS_GUIDE_CATALOG.find((candidate) => {
    return candidate.title === sectionTitle;
  });

  if (section === undefined) {
    throw new Error(
      `JarvisDemoMachine: no guide section titled "${sectionTitle}"`,
    );
  }

  const item = section.items[index];

  if (item === undefined) {
    throw new Error(
      `JarvisDemoMachine: guide section "${sectionTitle}" has no item at index ${index}`,
    );
  }

  return item.command;
}

/**
 * The hands-free scripted demo's fixed 7-step script (spec table, §5) —
 * every command resolved from `JARVIS_GUIDE_CATALOG` via `guideCommand`
 * rather than re-typed, so a future catalog edit that moves or reworks one
 * of these rows fails this module's own top-level evaluation instead of
 * silently sending a stale command. `label` groups steps 2 and 3 under the
 * same "MARKET INTEL" tag, and steps 4 and 5 under "GENERATIVE UI" — both
 * are two-command beats within the SAME catalog section (`DESK
 * INTELLIGENCE`, `GENERATIVE UI` respectively), reflected in the label
 * rather than the (single) catalog section title. Step 7 ("morning
 * workspace") deliberately runs LAST and sets `closesOverlay` so the
 * `JarvisDriverMachine` choreography it triggers is visible once the
 * overlay is out of the way — see `createJarvisDemoMachine`'s doc for the
 * full step fold.
 */
export const JARVIS_DEMO_STEPS: readonly JarvisDemoStep[] = [
  { label: "DESK BRIEFING", command: guideCommand("DESK INTELLIGENCE", 3) },
  { label: "MARKET INTEL", command: guideCommand("DESK INTELLIGENCE", 1) },
  { label: "MARKET INTEL", command: guideCommand("DESK INTELLIGENCE", 0) },
  { label: "GENERATIVE UI", command: guideCommand("GENERATIVE UI", 0) },
  { label: "GENERATIVE UI", command: guideCommand("GENERATIVE UI", 2) },
  {
    label: "EXECUTION",
    command: guideCommand("EXECUTION", 0),
    awaitsConfirmation: true,
  },
  {
    label: "MORNING WORKSPACE",
    command: guideCommand("DESK CONTROL", 0),
    closesOverlay: true,
  },
];

export const JARVIS_DEMO_INITIAL_STATE: JarvisDemoState = {
  running: false,
  stepIndex: 0,
  stepCount: JARVIS_DEMO_STEPS.length,
  label: null,
};

/** The pause after a step settles, and before step 6's decline. */
export function demoBeatMs(level: PowerSaverLevel): number {
  return level === "freeze" ? 0 : DEMO_STEP_BEAT_MS;
}

/** The id of the transcript's last entry, or `-1` for none — a step's
 * watermark, read just before it sends. */
export function lastEntryId(
  entries: readonly JarvisEntry[] | undefined,
): number {
  if (!entries || entries.length === 0) {
    return -1;
  }

  const last = entries[entries.length - 1];
  return last ? last.id : -1;
}

/** Marks step `index` (0-based) as the one in flight. */
export function advanceDemoPatch(
  step: JarvisDemoStep,
  index: number,
): (s: JarvisDemoState) => JarvisDemoState {
  return (s: JarvisDemoState): JarvisDemoState => {
    return { ...s, running: true, stepIndex: index + 1, label: step.label };
  };
}

/** True once `entries` contains the exact `[userEntry, jarvisEntry]` pair
 * `sendScripted(command)` appends for THIS step: a user-role entry with no
 * `origin` (an ordinary `send()`/`sendScripted()` turn, never a `narrate()`
 * one — see `JarvisEntry.origin`'s doc), id above `watermarkId` (appended
 * AFTER this step began, never a stale entry from an earlier step reusing
 * the same command text), text matching `command` exactly, immediately
 * followed by a jarvis-role entry (the streaming reply stub `turnItems$`'s
 * "start" item allocates in the SAME patch — see `JarvisMachine.ts`'s
 * `entryPatches$` doc). This is `runStep`'s sole signal that ITS turn (as
 * opposed to some OTHER turn already queued ahead of it, e.g. a racing
 * `narrate()` call) has actually started. */
function turnHasStarted(
  entries: readonly JarvisEntry[],
  watermarkId: number,
  command: string,
): boolean {
  return entries.some((entry, index) => {
    return (
      entry.id > watermarkId &&
      entry.role === "user" &&
      entry.origin === undefined &&
      entry.text === command &&
      entries[index + 1]?.role === "jarvis"
    );
  });
}

/** What a step's watcher asks its core to do next: `"decline"` — after one
 * beat, decline the pending confirmation (step 6 only, once); `"done"` /
 * `"error"` — the step's own turn ended that way; `null` — nothing yet. */
export type DemoStepSignal = "decline" | "done" | "error" | null;

export interface DemoStepWatch {
  /** Feed every Jarvis state the core observes after the step began. */
  observeState(state: JarvisState): void;
  /** Feed every Jarvis event; returns what the event means for this step. */
  observeEvent(event: JarvisEvent): DemoStepSignal;
}

/**
 * ONE demo step's settle detection — the core the demo's whole design turns
 * on. The core subscribes to the Jarvis state and events FIRST, then sends
 * the step's command (subscribe-before-fire: the events are a hot stream
 * with no replay), feeding everything it sees to this watcher.
 *
 * **Correlation, not phase-watching.** A `narrate()` turn can land
 * mid-demo and drive the same `phase: "speaking" → "idle"` transition a
 * naive phase watch would mistake for THIS step's settle. Instead the state's
 * `entries` are watched for the precise `[userEntry, jarvisEntry]` pair the
 * step's `sendScripted` appends (`turnHasStarted`, keyed off `watermark`, the
 * last entry id captured just before the send) — a narrator's pair carries
 * `origin: "narrator"` and fails that match by construction, and a turn
 * queued ahead of this one appears first and leaves the match false.
 *
 * **The terminal signal comes from the events, not `entries[...].done`**:
 * an entry's `done` is set identically for `"done"` and `"error"`; only the
 * event's `type` distinguishes them. Once the step's pair is visible, the
 * single serial turn queue guarantees the very next `"done"`/`"error"`
 * belongs to THIS turn, so no turn id is needed on the event.
 *
 * `step.awaitsConfirmation` (step 6 only) answers the FIRST
 * `"confirmRequest"` after the turn started with `"decline"` — never an
 * approval; the demo must never place a trade.
 */
export function createDemoStepWatch(
  step: JarvisDemoStep,
  watermark: number,
): DemoStepWatch {
  let started = false;
  let confirmationHandled = false;

  return {
    observeState: (state: JarvisState): void => {
      if (!started && turnHasStarted(state.entries, watermark, step.command)) {
        started = true;
      }
    },
    observeEvent: (event: JarvisEvent): DemoStepSignal => {
      if (!started) {
        return null;
      }

      if (
        step.awaitsConfirmation &&
        !confirmationHandled &&
        event.type === "confirmRequest"
      ) {
        confirmationHandled = true;
        return "decline";
      }

      if (event.type === "done" || event.type === "error") {
        return event.type;
      }

      return null;
    },
  };
}
