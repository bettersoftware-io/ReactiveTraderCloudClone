import type { CoreImpl, CoreOption } from "@rtc/core-api";

import type { CoreHostState } from "./coreHost";

/** The swap a `CoreHostState` describes, with each core's display option:
 * what `CoreSwapOverlay` takes as its `swap` prop. */
export interface CoreSwapView {
  readonly from: CoreOption;
  readonly to: CoreOption;
  readonly phase: "covering" | "loading" | "handover" | "revealing";
}

/**
 * Maps the core host's state to what the swap overlay shows. Twin of
 * `client-solid`'s `src/app/coreSwapView.ts`, byte for byte.
 *
 * Null means "render nothing", for both states with no swap under way:
 * `running`, and `fatal` — there the boot-error screen has replaced the
 * page, and an overlay left up would cover it.
 */
export function coreSwapOf(
  state: CoreHostState,
  options: readonly CoreOption[],
): CoreSwapView | null {
  if (state.phase === "running" || state.phase === "fatal") {
    return null;
  }

  return {
    from: optionOf(state.from, options),
    to: optionOf(state.to, options),
    phase: state.phase,
  };
}

/** The option for `impl`; a core with none is named by its impl. */
function optionOf(impl: CoreImpl, options: readonly CoreOption[]): CoreOption {
  const option = options.find((candidate) => {
    return candidate.impl === impl;
  });

  return option ?? { impl, label: impl, description: "" };
}
