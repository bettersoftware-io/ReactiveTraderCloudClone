import type { SessionInfo } from "@rtc/domain";

import type { Stream } from "#/stream";

/** The live session roster (Admin) — one shared subscription, kept warm. */
export interface SessionsPresenter {
  readonly sessions$: Stream<readonly SessionInfo[]>;
}
