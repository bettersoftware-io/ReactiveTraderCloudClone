import { useEffect, useRef, useState } from "react";

import { useViewModel } from "@rtc/react-bindings";

export interface JarvisDrivenPulse {
  readonly pulsing: boolean;
  readonly clearPulse: () => void;
}

/**
 * One-shot ~700ms driven-pulse cue: `pulsing` flips `true` for a single CSS
 * animation cycle whenever `jarvisDriver.state$`'s `lastBatch` records a NEW
 * `"applied"` `DriveOutcome` (a `"skipped"` outcome never triggers it), and
 * is cleared by the consumer's own `onAnimationEnd={clearPulse}` — no
 * fixed-delay JS timer anywhere (docs/performance.md idiom: CSS `animation`
 * + `animationend`, mirroring `panels.module.css`'s `.flashOnChange` /
 * `rfqCardAnim.ts`'s entrance-cascade precedents — banned outright in
 * `src/ui` by this repo's grep gates).
 *
 * `lastBatch` gets a BRAND NEW array reference on every emission — both the
 * synchronous reset-to-`[]` at the start of a batch and each one-command-at-
 * a-time append (see JarvisDriverMachine.ts's doc) — so this effect runs on
 * every one of those, not just the batch's final state. That is what makes
 * the "did the applied count just grow" comparison below correct across
 * batch boundaries: the reset emission's own effect run zeroes
 * `appliedSeenRef` BEFORE the new batch's first command can land, so a new
 * batch with FEWER applied commands than the previous one still pulses
 * correctly on its own first applied command.
 *
 * Freeze-gated at the SOURCE (never sets `pulsing` true while
 * `usePowerSaver().isFreeze`), in addition to the CSS catch-all
 * (DrivenPulse.module.css) that would otherwise still spin up a near-instant
 * Animation object — the same "JS gate + CSS catch-all" doctrine every other
 * one-shot flash in this codebase follows.
 */
export function useJarvisDrivenPulse(): JarvisDrivenPulse {
  const { useJarvisDriver, usePowerSaver } = useViewModel();
  const { lastBatch } = useJarvisDriver();
  const { isFreeze } = usePowerSaver();
  const [pulsing, setPulsing] = useState(false);
  const appliedSeenRef = useRef(0);

  useEffect(() => {
    const appliedCount = lastBatch.filter((outcome) => {
      return outcome.status === "applied";
    }).length;

    if (appliedCount > appliedSeenRef.current && !isFreeze) {
      setPulsing(true);
    }

    appliedSeenRef.current = appliedCount;
  }, [lastBatch, isFreeze]);

  function clearPulse(): void {
    setPulsing(false);
  }

  return { pulsing, clearPulse };
}
