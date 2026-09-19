import type { DriveCommandV1 } from "@rtc/shared";

import type { StateStream, Stream } from "#/stream";

/** One command's application result. `"skipped"` is the SILENT not-applied
 * case — a membership miss (unknown `panelId`/`symbol`) or a no-op setter
 * already at the requested value. `"refused"` is not-applied for a reason the
 * USER should hear (e.g. a layout op on a panel that is floating or popped
 * out and must be docked first) — `JarvisMachine` folds it into the
 * transcript. `reason` is always present for `"refused"`, and for every
 * `"skipped"` outcome the driver produces; never for `"applied"`. */
export type DriveOutcome = {
  readonly command: DriveCommandV1;
  readonly status: "applied" | "skipped" | "refused";
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
   * through here, unfiltered (`"refused"` too). `composition.ts` subscribes
   * this into `JarvisMachine.intents.recordDriveOutcome`, which does its own
   * filtering (applied + refused fold, skipped doesn't) when folding a
   * transcript row — see that
   * intent's doc for why the filter lives there and not here. Never
   * completes: same session-lifetime, no-teardown-seam doctrine as
   * `state$` above. */
  readonly outcomes$: Stream<DriveOutcome>;
}
