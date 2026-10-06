import type { CoreOption, Stream } from "@rtc/core-api";

import type { CoreHostState } from "./coreHost";
import { type CoreSwapView, coreSwapOf } from "./coreSwapView";

export interface CoreSwapCoverDeps {
  /** The element the app tree is mounted in. */
  readonly rootEl: HTMLElement;
  readonly options: readonly CoreOption[];
  /** Renders the swap overlay, synchronously; null removes it. */
  readonly show: (swap: CoreSwapView | null) => void;
}

/**
 * Keeps the page in step with the core host for the page's lifetime: while a
 * swap is under way the overlay is shown and the app tree is `inert`. Twin
 * of `client-solid`'s `src/app/coreSwapCover.ts`, byte for byte.
 *
 * The overlay only covers the tree; it does not stop the keyboard. The tree
 * underneath stays mounted through `covering` and `loading` and is mounted
 * again before the cover lifts, so without `inert` a document-level hotkey
 * or a Tab and Enter would work controls nobody can see. `inert` also takes
 * the hidden tree out of the accessibility tree. It is set before the
 * overlay is shown, and released on every way out of a swap: the host always
 * ends in `running` or in `fatal`, and both map to no swap. On `fatal` the
 * boot-error screen sits in this same element, and must be usable.
 */
export function followCoreSwaps(
  state$: Stream<CoreHostState>,
  deps: CoreSwapCoverDeps,
): void {
  state$.subscribe((state) => {
    const swap = coreSwapOf(state, deps.options);
    deps.rootEl.inert = swap !== null;
    deps.show(swap);
  });
}
