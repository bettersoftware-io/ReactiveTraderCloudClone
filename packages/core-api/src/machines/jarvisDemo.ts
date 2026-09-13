import type { StateStream } from "#/stream";

export interface JarvisDemoStep {
  /** Rendered by `JarvisDemoState.label` while this step is in flight — a
   * short section-style tag, not necessarily the catalog section title
   * verbatim (see `JARVIS_DEMO_STEPS`'s own doc for why MARKET INTEL, e.g.,
   * covers two catalog rows under `DESK INTELLIGENCE`). */
  readonly label: string;
  /** The literal text sent via `sendScripted` — always resolved from
   * `JARVIS_GUIDE_CATALOG` through `guideCommand`, never typed by hand. */
  readonly command: string;
  /** Only step 7 ("Set up my morning workspace") sets this: `runStepPatches$`
   * calls `jarvis.close()` before `sendScripted` so the drive choreography
   * `JarvisDriverMachine` performs is actually visible once the overlay is
   * out of the way. */
  readonly closesOverlay?: boolean;
  /** Only step 6 ("Buy 5M EURUSD") sets this: `runStep` waits for the
   * matching `"confirmRequest"` turn event, holds one beat, then calls
   * `declineConfirmation()` — never `approveConfirmation()`, the demo must
   * never actually place a trade. Every other step ignores a
   * `"confirmRequest"` event entirely (none of their commands trigger
   * one). */
  readonly awaitsConfirmation?: boolean;
}

export interface JarvisDemoState {
  readonly running: boolean;
  /** 1-based while `running` (the step currently in flight); `0` while
   * idle. */
  readonly stepIndex: number;
  /** Static — always `JARVIS_DEMO_STEPS.length`. */
  readonly stepCount: number;
  /** The in-flight step's `label`, or `null` while idle. */
  readonly label: string | null;
}

export interface JarvisDemoIntents {
  readonly startDemo: () => void;
  readonly stopDemo: () => void;
}

/** `createJarvisDemoMachine`'s return — named to match the
 * `JarvisDriverMachineHandle`/`JarvisPanelsMachineHandle` sibling idiom. No
 * `dispose`: like those, this is a session-lifetime composition singleton
 * with no per-consumer teardown seam. */
export interface JarvisDemoMachineHandle {
  readonly state$: StateStream<JarvisDemoState>;
  readonly intents: JarvisDemoIntents;
}
