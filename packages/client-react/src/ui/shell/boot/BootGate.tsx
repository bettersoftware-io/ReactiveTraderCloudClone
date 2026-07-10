import type { ReactElement, ReactNode, TransitionEvent } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { BootSequence } from "./BootSequence";

import styles from "./BootGate.module.css";

/**
 * Mounts the app immediately (so its streams warm during boot) and overlays the
 * BootSequence splash on top while the boot-gate seam reports it visible. The
 * splash's own CSS fades it out on `data-done` (BootSequence.module.css
 * `.boot[data-done]`); BootGate then dismisses through the seam once that
 * opacity transition ends — the `transitionend` bubbles from the splash root to
 * this host. Under reduced motion the splash has no transition, so `onDone`
 * dismisses at once instead of waiting for a `transitionend` that would never
 * fire.
 *
 * Visibility lives in the `useBootGate` seam (BootGatePresenter): it is seeded
 * from the one-shot boot-splash decision at composition time, and the account
 * menu's ⟳ Reboot HUD row re-raises it. Each re-raise remounts BootSequence,
 * so its per-mount machine replays fresh (advancing the variant pointer).
 */
export function BootGate({ children }: BootGateProps): ReactElement {
  const { useBootGate } = useViewModel();
  const { visible, dismiss } = useBootGate();

  function handleDone(): void {
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Reduced motion: the splash jump-cuts to opacity 0 with no transition, so
    // no transitionend arrives — dismiss it directly.
    if (reduce) {
      dismiss();
    }
  }

  function handleTransitionEnd(event: TransitionEvent<HTMLDivElement>): void {
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
        <div className={styles.host} onTransitionEnd={handleTransitionEnd}>
          <BootSequence onDone={handleDone} />
        </div>
      ) : null}
    </>
  );
}

interface BootGateProps {
  children: ReactNode;
}
