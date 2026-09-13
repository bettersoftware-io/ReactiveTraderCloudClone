import type { Instrument } from "@rtc/domain";

import type { Stream } from "#/stream";

/** The credit instrument roster — replay-current, kept warm for the session. */
export interface InstrumentsPresenter {
  readonly list$: Stream<readonly Instrument[]>;
}
