import { useEffect, useRef, useState } from "react";

import { useViewModel } from "@rtc/react-bindings";

export interface JarvisDrivenPulse {
  readonly pulsing: boolean;
  readonly clearPulse: (event: PulseAnimationEndEvent) => void;
}

/** The two fields `clearPulse` reads, shared structurally with React's
 * synthetic `AnimationEvent<Element>` (the JSX `onAnimationEnd` wiring) —
 * mirrors RfqCard.tsx's `CardTransitionEvent` idiom so callers can pass
 * `clearPulse` straight into `onAnimationEnd` without this file importing
 * a React event type by name. */
interface PulseAnimationEndEvent {
  readonly target: EventTarget | null;
  readonly currentTarget: EventTarget | null;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Same `matchMedia` read `useRankGlide.ts`/`JarvisPanelLayer.tsx`/
 * `useFlipGrid.ts` already use — a fresh synchronous check, not cached, so a
 * mid-session OS flip is picked up on the very next outcome. */
function prefersReducedMotion(): boolean {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
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
 * Gated at the SOURCE — never sets `pulsing` true while
 * `usePowerSaver().isFreeze` OR `prefers-reduced-motion: reduce` — in
 * addition to the CSS catch-all (DrivenPulse.module.css) that would
 * otherwise still spin up a near-instant Animation object under freeze, the
 * same "JS gate + CSS catch-all" doctrine every other one-shot flash in this
 * codebase follows. The reduced-motion half of the gate is load-bearing, not
 * belt-and-suspenders: `DrivenPulse.module.css`'s
 * `@media (prefers-reduced-motion: reduce) { .driven { animation: none; } }`
 * means NO `animationend` ever fires there, so without this JS-side gate
 * `pulsing` would latch `true` forever after the first outcome — never
 * cleared, blocking every later pulse for the rest of the session.
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

    if (
      appliedCount > appliedSeenRef.current &&
      !isFreeze &&
      !prefersReducedMotion()
    ) {
      setPulsing(true);
    }

    appliedSeenRef.current = appliedCount;
  }, [lastBatch, isFreeze]);

  function clearPulse(event: PulseAnimationEndEvent): void {
    // Ignore animationend events BUBBLING from a descendant — e.g. every FX
    // tile's own tick-flash animation (TilePrice.module.css) bubbles through
    // the workspace wrapper on every price tick. Same guard as
    // RfqCard.tsx's settleCardTransition; without it, a descendant's
    // animationend tears the pulse down within tens of ms instead of the
    // intended ~700ms.
    if (event.target !== event.currentTarget) {
      return;
    }

    setPulsing(false);
  }

  return { pulsing, clearPulse };
}
