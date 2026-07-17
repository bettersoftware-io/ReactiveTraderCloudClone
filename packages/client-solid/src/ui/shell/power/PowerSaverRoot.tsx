import type { JSX } from "solid-js";
import { createEffect, onCleanup } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

/**
 * Applies the power-saver preference to the document root: a
 * `data-power-saver` flag (test/e2e observability) and the inherited
 * `--fx-play` play-state variable that every decorative animation reads
 * (`animation-play-state: var(--fx-play, running)`). Same rationale as
 * ThemeProvider: applying a preference to the document is RENDERING — the
 * View's job — and is deliberately coupled to the web render target.
 * Renders nothing.
 */
export function PowerSaverRoot(): JSX.Element {
  const { usePowerSaver } = useViewModel();
  const { enabled } = usePowerSaver();

  createEffect(() => {
    document.documentElement.dataset.powerSaver = enabled() ? "true" : "false";
    document.documentElement.style.setProperty(
      "--fx-play",
      enabled() ? "paused" : "running",
    );
  });

  onCleanup(() => {
    delete document.documentElement.dataset.powerSaver;
    document.documentElement.style.removeProperty("--fx-play");
  });

  return null;
}
