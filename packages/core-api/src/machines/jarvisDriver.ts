import type { DriveCommandV1 } from "@rtc/shared";

import type { StateStream, Stream } from "#/stream";

/** One command's application result — `"skipped"` covers both a membership
 * miss (unknown `panelId`/`symbol`) and a no-op setter already at the
 * requested value; `reason` is present only for `"skipped"`. */
export type DriveOutcome = {
  readonly command: DriveCommandV1;
  readonly status: "applied" | "skipped";
  readonly reason?: string;
};

export interface JarvisDriverState {
  readonly lastBatch: readonly DriveOutcome[];
}

/** `createJarvisDriverMachine`'s return — named to match the
 * `JarvisPanelsMachineHandle`/`WorkspaceNavMachine` sibling idiom. No
 * `dispose`: like `JarvisPanelsMachineHandle`, this is a session-lifetime
 * composition singleton with no per-consumer teardown seam. */
export interface JarvisDriverMachineHandle {
  readonly state$: StateStream<JarvisDriverState>;
  /** Emits once per command, in APPLICATION order (i.e. staggered exactly
   * like `state$.lastBatch` fills in — the two are nexted from the same
   * `map()` callback) — both `"applied"` AND `"skipped"` outcomes flow
   * through here, unfiltered. `composition.ts` subscribes this into
   * `JarvisMachine.intents.recordDriveOutcome`, which does its own
   * applied-only filtering when folding a transcript row — see that
   * intent's doc for why the filter lives there and not here. Never
   * completes: same session-lifetime, no-teardown-seam doctrine as
   * `state$` above. */
  readonly outcomes$: Stream<DriveOutcome>;
}
