import {
  type ReactElement,
  type ReactNode,
  type TransitionEvent,
  useEffect,
  useState,
} from "react";

import styles from "@rtc/boot-splash/styles/BootGate.module.css";
import { useViewModel } from "@rtc/react-bindings";

import { BootSequence } from "./BootSequence";

/**
 * Mounts the app immediately (so its streams warm during boot) and overlays the
 * BootSequence splash on top while the boot-gate seam reports it visible. The
 * splash's own CSS fades it out on `data-done` (BootSequence.module.css
 * `.boot[data-done]`); BootGate then dismisses through the seam once that
 * opacity transition ends — the `transitionend` bubbles from the splash root to
 * this host. Under reduced motion or power-saver Freeze the splash has no
 * transition, so the gate dismisses as soon as the sequence is done instead
 * of waiting for a `transitionend` that would never fire.
 *
 * Visibility lives in the `useBootGate` seam (BootGatePresenter): it is seeded
 * from the one-shot boot-splash decision at composition time, and the account
 * menu's ⟳ Reboot HUD row re-raises it. Each re-raise remounts BootSequence,
 * so its per-mount machine replays fresh (advancing the variant pointer).
 */
export function BootGate({ children }: BootGateProps): ReactElement {
  const { useBootGate, useForceBootAnimation, usePowerSaver } = useViewModel();
  const { visible, dismiss } = useBootGate();
  const forced = useForceBootAnimation().enabled;
  const { isFreeze } = usePowerSaver();

  const [done, setDone] = useState(false);

  // A splash that is gone is not done: the next one (⟳ Reboot HUD) starts
  // over. Adjusted during render, React's "state from a prop change".
  if (!visible && done) {
    setDone(false);
  }

  // BootSequence keeps the `onDone` of its FIRST render (the boot machine is
  // built once, around it), so that function must not read anything a later
  // render can change: it only records that the sequence is done. The
  // decision below is taken from the current render's values. It used to be
  // taken inside `onDone`, from the first render's: a stored power-saver
  // Freeze reaches the UI one render later, so the splash waited for a
  // `transitionend` Freeze had switched off, and stayed mounted for good.
  function markDone(): void {
    setDone(true);
  }

  useEffect(() => {
    if (!done) {
      return;
    }

    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Reduced motion (and NOT forced) or power-saver Freeze: the splash
    // jump-cuts to opacity 0 with no transition (freeze's catch-all sets
    // `transition-property: none`, so no transitionend ever arrives) — dismiss
    // it directly. Freeze wins over forced, which overrides only the
    // accessibility signal. Otherwise the transition runs (restored when
    // forced — see BootSequence.module.css) and dismissOnOpacityEnd dismisses.
    if (isFreeze || (reduce && !forced)) {
      dismiss();
    }
  }, [done, isFreeze, forced, dismiss]);

  function dismissOnOpacityEnd(event: TransitionEvent<HTMLDivElement>): void {
    // Only the splash root animates opacity; ignore the progress-bar/skip
    // transitions that also bubble through this host.
    if (event.propertyName === "opacity") {
      dismiss();
    }
  }

  return (
    <>
      {children}
      {visible ? (
        <div className={styles.host} onTransitionEnd={dismissOnOpacityEnd}>
          <BootSequence onDone={markDone} />
        </div>
      ) : null}
    </>
  );
}

interface BootGateProps {
  children: ReactNode;
}
