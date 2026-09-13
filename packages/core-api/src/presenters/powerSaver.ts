import type { PowerSaverLevel } from "@rtc/domain";

import type { Stream } from "#/stream";

/**
 * The power-saver master override: the replay-current level plus derived
 * predicates — `isCalm$` (level !== "off", drives ambient removal / --fx-play /
 * price conflation) and `isFreeze$` (level === "freeze", drives the view
 * layer's motion catch-all + JS gates). Never mutates other preferences
 * (master-override semantics).
 */
export interface PowerSaverPresenter {
  readonly level$: Stream<PowerSaverLevel>;
  readonly isCalm$: Stream<boolean>;
  readonly isFreeze$: Stream<boolean>;
  setLevel(level: PowerSaverLevel): void;
}
