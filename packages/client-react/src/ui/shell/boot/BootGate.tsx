import type { ReactElement, ReactNode, TransitionEvent } from "react";
import { useState } from "react";

import { BootSequence } from "./BootSequence";

import styles from "./BootGate.module.css";

/**
 * Mounts the app immediately (so its streams warm during boot) and overlays the
 * BootSequence splash on top until the boot sequence completes. The splash's own
 * CSS fades it out on `data-done` (BootSequence.module.css `.boot[data-done]`);
 * BootGate then unmounts the overlay once that opacity transition ends — the
 * `transitionend` bubbles from the splash root to this host. Under reduced
 * motion the splash has no transition, so `onDone` unmounts it at once instead
 * of waiting for a `transitionend` that would never fire.
 *
 * Gating of *whether* to mount BootGate at all lives in AppRoot
 * (see shouldPlayBootSplash) — by the time we render, the splash is playing.
 */
export function BootGate({ children }: BootGateProps): ReactElement {
  const [showSplash, setShowSplash] = useState(true);

  function handleDone(): void {
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    // Reduced motion: the splash jump-cuts to opacity 0 with no transition, so
    // no transitionend arrives — unmount it directly.
    if (reduce) setShowSplash(false);
  }

  function handleTransitionEnd(event: TransitionEvent<HTMLDivElement>): void {
    // Only the splash root animates opacity; ignore the progress-bar/skip
    // transitions that also bubble through this host.
    if (event.propertyName === "opacity") setShowSplash(false);
  }

  return (
    <>
      {children}
      {showSplash ? (
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
