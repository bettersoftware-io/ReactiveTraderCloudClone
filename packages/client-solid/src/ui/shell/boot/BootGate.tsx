import type { JSX, ParentProps } from "solid-js";
import { Show } from "solid-js";

import styles from "@rtc/boot-splash/styles/BootGate.module.css";
import { useViewModel } from "@rtc/solid-bindings";

import { BootSequence } from "./BootSequence";

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
export function BootGate(props: ParentProps): JSX.Element {
  const { useBootGate, useForceBootAnimation } = useViewModel();
  const { visible, dismiss } = useBootGate();
  const { enabled: forced } = useForceBootAnimation();

  function handleDone(): void {
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Reduced motion (and NOT forced): the splash jump-cuts to opacity 0 with
    // no transition, so no transitionend arrives — dismiss it directly. When
    // forced, the transition is restored (see BootSequence.module.css) and
    // handleTransitionEnd dismisses instead.
    if (reduce && !forced()) {
      dismiss();
    }
  }

  function handleTransitionEnd(event: TransitionEvent): void {
    // Only the splash root animates opacity; ignore the progress-bar/skip
    // transitions that also bubble through this host.
    if (event.propertyName === "opacity") {
      dismiss();
    }
  }

  return (
    <>
      {props.children}
      <Show when={visible()}>
        <div class={styles.host} onTransitionEnd={handleTransitionEnd}>
          <BootSequence onDone={handleDone} />
        </div>
      </Show>
    </>
  );
}
