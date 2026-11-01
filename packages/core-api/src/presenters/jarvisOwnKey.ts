import type { JarvisProvider } from "@rtc/domain";

import type { Stream } from "#/stream";

/** What the person typed into the key form. The only place the raw key
 * enters a presenter; it goes to the store and the transport, never back out. */
export interface OwnKeyInput {
  readonly provider: JarvisProvider;
  readonly key: string;
  readonly capUsd: number | null;
  readonly remember: boolean;
}

/** What a presenter shows of a saved key: the masked form only. */
export interface SavedOwnKey {
  readonly provider: JarvisProvider;
  readonly masked: string;
  readonly capUsd: number | null;
  readonly remember: boolean;
}

/** The person's own model key. `saved$` and every value it carries hold the
 * masked form only; the raw key passes through `save` and `JarvisPort.setOwnKey`. */
export interface JarvisOwnKeyPresenter {
  readonly saved$: Stream<SavedOwnKey | null>;
  save(input: OwnKeyInput): void;
  setCap(capUsd: number | null): void;
  remove(): void;
}
