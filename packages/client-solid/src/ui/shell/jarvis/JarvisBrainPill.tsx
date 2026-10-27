import { createSignal, For, type JSX, Show } from "solid-js";

import { describeBrainPill } from "@rtc/core-logic";
import {
  JARVIS_BRAIN_NAMES,
  JARVIS_BRAINS,
  type JarvisBrain,
} from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./JarvisBrainPill.module.css";

/**
 * The input-bar brain pill: the effective brain (and what is left of today's
 * budget) with a small menu to switch the saved brain. Offered brains follow
 * `JARVIS_BRAINS` order; a brain the active gate has removed is disabled, the
 * same rule as the Preferences Brain picker. The menu has no animation.
 *
 * Escape inside the menu closes the menu only: the overlay's own Escape
 * listener lives on `document` and returns early for a defaultPrevented key.
 * (Solid delegates its handlers to `document` too, so stopPropagation alone
 * could not hold a sibling document listener back.)
 */
export function JarvisBrainPill(): JSX.Element {
  const { useJarvis, useJarvisPreferences } = useViewModel();
  const { state } = useJarvis();
  const { setBrain } = useJarvisPreferences();
  const [menuOpen, setMenuOpen] = createSignal(false);
  let pillRef: HTMLButtonElement | undefined;

  function offered(): readonly JarvisBrain[] {
    return JARVIS_BRAINS.filter((brain) => {
      return brain === "scripted" || state().brains.includes(brain);
    });
  }

  function isGated(brain: JarvisBrain): boolean {
    return state().gate?.gated.includes(brain) === true;
  }

  function toggleMenu(): void {
    setMenuOpen((open) => {
      return !open;
    });
  }

  function closeMenuToPill(): void {
    setMenuOpen(false);
    pillRef?.focus();
  }

  function closeMenuOnEscape(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !menuOpen()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    closeMenuToPill();
  }

  function chooseBrain(brain: JarvisBrain) {
    return () => {
      setBrain(brain);
      closeMenuToPill();
    };
  }

  return (
    <div class={styles.wrap}>
      <button
        ref={pillRef}
        type="button"
        data-testid="jarvis-brain-pill"
        aria-haspopup="menu"
        aria-expanded={menuOpen()}
        class={styles.pill}
        onClick={toggleMenu}
        onKeyDown={closeMenuOnEscape}
      >
        {describeBrainPill(state())}
        <span class={styles.caret} aria-hidden="true">
          ▾
        </span>
      </button>
      <Show when={menuOpen()}>
        <div
          role="menu"
          aria-label="Brain"
          data-testid="jarvis-brain-menu"
          class={styles.menu}
          onKeyDown={closeMenuOnEscape}
        >
          <For each={offered()}>
            {(brain: JarvisBrain) => {
              return (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={brain === state().effectiveBrain}
                  data-testid={`jarvis-brain-option-${brain}`}
                  class={styles.option}
                  disabled={isGated(brain)}
                  onClick={chooseBrain(brain)}
                >
                  <span class={styles.mark} aria-hidden="true">
                    {brain === state().effectiveBrain ? "✓" : ""}
                  </span>
                  {JARVIS_BRAIN_NAMES[brain]}
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
