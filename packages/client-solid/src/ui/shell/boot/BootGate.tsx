import {
  createEffect,
  createSignal,
  type JSX,
  type ParentProps,
  Show,
} from "solid-js";

import styles from "@rtc/boot-splash/styles/BootGate.module.css";
import { useViewModel } from "@rtc/solid-bindings";

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
export function BootGate(props: ParentProps): JSX.Element {
  const { useBootGate, useForceBootAnimation, usePowerSaver } = useViewModel();
  const { visible, dismiss } = useBootGate();
  const { enabled: forced } = useForceBootAnimation();
  const { isFreeze } = usePowerSaver();

  const [done, setDone] = createSignal(false);

  // `onDone` only records that the sequence is done. The decision below is
  // an effect over the current values, not a one-off taken at that moment:
  // a Freeze switched on while the splash is fading turns the transition
  // off, so the `transitionend` the gate was waiting for never arrives.
  function markDone(): void {
    setDone(true);
  }

  createEffect(() => {
    // A splash that is gone is not done: the next one (⟳ Reboot HUD) starts
    // over.
    if (!visible()) {
      setDone(false);
      return;
    }

    if (!done()) {
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
    if (isFreeze() || (reduce && !forced())) {
      dismiss();
    }
  });

  function dismissOnOpacityEnd(event: TransitionEvent): void {
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
        <div class={styles.host} onTransitionEnd={dismissOnOpacityEnd}>
          <BootSequence onDone={markDone} />
        </div>
      </Show>
    </>
  );
}
