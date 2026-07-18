import { useLayoutEffect } from "react";

import { useViewModel } from "@rtc/react-bindings";

/**
 * Applies the power-saver preference to the document root: a
 * `data-power-saver` attribute holding the current level (`off` / `calm` /
 * `freeze`, test/e2e observability) and the inherited `--fx-play` play-state
 * variable that every decorative animation reads
 * (`animation-play-state: var(--fx-play, running)`), paused whenever the
 * level is not `off` (Calm and Freeze both kill decorative motion). Same
 * rationale as ThemeProvider: applying a preference to the document is
 * RENDERING — the View's job — and is deliberately coupled to the web
 * render target. Renders nothing.
 */
export function PowerSaverRoot(): null {
  const { usePowerSaver } = useViewModel();
  const { level, isCalm } = usePowerSaver();

  useLayoutEffect(() => {
    document.documentElement.dataset.powerSaver = level;
    document.documentElement.style.setProperty(
      "--fx-play",
      isCalm ? "paused" : "running",
    );
  }, [level, isCalm]);

  return null;
}
