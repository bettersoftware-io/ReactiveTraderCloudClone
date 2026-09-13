import type { LogEvent } from "@rtc/domain";

import type { Stream } from "#/stream";

/**
 * The newest-first rolling log window, capped at MAX_LOG_ROWS. Starts with an
 * empty array before any events arrive so dumb-UI components render
 * immediately without suspending.
 */
export interface EventLogPresenter {
  readonly events$: Stream<readonly LogEvent[]>;
}
