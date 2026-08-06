import {
  type Accessor,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

export interface JarvisDrivenPulse {
  readonly pulsing: Accessor<boolean>;
  /** Ref callback — wire it onto the SAME element `pulsing`'s
   * `data-jarvis-driven` attribute is toggled on (the nav rail, the
   * workspace wrapper), e.g. `<nav ref={pulse.ref} ...>`. Captures the host
   * element so `onMount` below can attach the native animationend listeners
   * (see this file's own doc for why native, not JSX `onAnimationEnd`). */
  readonly ref: (el: HTMLElement) => void;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Same `matchMedia` read `useFlipGrid.ts`/`useRankGlide.ts`/`JarvisPanelLayer.tsx`
 * already use — a fresh synchronous check, not cached, so a mid-session OS
 * flip is picked up on the very next outcome. */
function prefersReducedMotion(): boolean {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

/**
 * One-shot ~700ms driven-pulse cue — the Solid counterpart of client-react's
 * `useJarvisDrivenPulse`: `pulsing` flips `true` for a single CSS animation
 * cycle whenever `jarvisDriver.state$`'s `lastBatch` records a NEW
 * `"applied"` `DriveOutcome` (a `"skipped"` outcome never triggers it), and
 * is cleared by the wrapper element's own animationend — no fixed-delay JS
 * timer anywhere (docs/performance.md idiom: CSS `animation` + `animationend`,
 * mirroring `panels.module.css`'s `.flashOnChange` / `rfqCardAnim.ts`'s
 * entrance-cascade precedents — banned outright in `src/ui` by this repo's
 * grep gates).
 *
 * NATIVE listener, not JSX `onAnimationEnd`: mirrors RfqCard.tsx's own
 * documented reason — Solid's JSX `onAnimationEnd` binding only ever listens
 * for the unprefixed `"animationend"` name (no react-dom-style
 * `window.AnimationEvent` feature-detection/vendor-prefix fallback), and
 * this repo's jsdom has no `window.AnimationEvent` at all, so a real browser
 * AND this test environment both need covering — real browsers only ever
 * fire the unprefixed name, jsdom-driven tests fire the WebKit-prefixed one
 * (RfqsPanelPage.ts's documented quirk), so both are subscribed.
 *
 * `lastBatch` gets a BRAND NEW array reference on every emission — both the
 * synchronous reset-to-`[]` at the start of a batch and each one-command-at-
 * a-time append (see JarvisDriverMachine.ts's doc) — so this effect runs on
 * every one of those, not just the batch's final state. That is what makes
 * the "did the applied count just grow" comparison below correct across
 * batch boundaries: the reset emission's own effect run zeroes
 * `appliedSeen` BEFORE the new batch's first command can land, so a new
 * batch with FEWER applied commands than the previous one still pulses
 * correctly on its own first applied command.
 *
 * Gated at the SOURCE — never sets `pulsing` true while
 * `usePowerSaver().isFreeze()` OR `prefers-reduced-motion: reduce` — in
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
  const driverState = useJarvisDriver();
  const { isFreeze } = usePowerSaver();
  const [pulsing, setPulsing] = createSignal(false);
  let appliedSeen = 0;
  let hostEl: HTMLElement | undefined;

  createEffect(() => {
    const appliedCount = driverState().lastBatch.filter((outcome) => {
      return outcome.status === "applied";
    }).length;

    if (appliedCount > appliedSeen && !isFreeze() && !prefersReducedMotion()) {
      setPulsing(true);
    }

    appliedSeen = appliedCount;
  });

  // Ignore animationend events BUBBLING from a descendant — e.g. every FX
  // tile's own tick-flash animation (TilePrice.module.css) bubbles through
  // the workspace wrapper on every price tick. Same guard as RfqCard.tsx's
  // settleCardTransition; without it, a descendant's animationend tears the
  // pulse down within tens of ms instead of the intended ~700ms.
  function clearPulse(event: Event): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    setPulsing(false);
  }

  function bindPulseTarget(el: HTMLElement): void {
    hostEl = el;
  }

  onMount(() => {
    if (!hostEl) {
      return;
    }

    const el = hostEl;
    el.addEventListener("animationend", clearPulse);
    el.addEventListener("webkitAnimationEnd", clearPulse);

    onCleanup(() => {
      el.removeEventListener("animationend", clearPulse);
      el.removeEventListener("webkitAnimationEnd", clearPulse);
    });
  });

  return { pulsing, ref: bindPulseTarget };
}
