import {
  createEffect,
  createSignal,
  For,
  type JSX,
  onCleanup,
  Show,
} from "solid-js";

import { describeBrainPill } from "@rtc/core-logic";
import { JARVIS_BRAINS, type JarvisBrain, jarvisBrainName } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./JarvisBrainPill.module.css";

/**
 * The input-bar brain pill: the effective brain (and what is left of today's
 * budget) with a small menu to switch the saved brain. Offered brains follow
 * `JARVIS_BRAINS` order; a brain the active gate has removed is disabled, the
 * same rule as the Preferences Brain picker. The menu has no animation.
 *
 * While the menu is open, Escape closes the menu only, wherever focus is: a
 * `document` keydown listener in the CAPTURE phase runs before any bubble
 * listener (the overlay's own Escape listener, and Solid's delegated
 * handlers, among them), calls `preventDefault()` + `stopPropagation()`,
 * closes the menu and returns focus to the pill. A key handler on the pill or
 * the menu would miss the Escape whenever focus sits elsewhere — Safari and
 * macOS Firefox do not focus a clicked button, and Chrome loses it to a click
 * into the input. Opening the menu moves focus to the checked item (the ARIA
 * menu pattern).
 */
export function JarvisBrainPill(): JSX.Element {
  const { useJarvis, useJarvisPreferences } = useViewModel();
  const { state } = useJarvis();
  const { setBrain } = useJarvisPreferences();
  const [menuOpen, setMenuOpen] = createSignal(false);
  let pillRef: HTMLButtonElement | undefined;
  let menuRef: HTMLDivElement | undefined;

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
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    closeMenuToPill();
  }

  createEffect(() => {
    if (!menuOpen()) {
      return;
    }

    document.addEventListener("keydown", closeMenuOnEscape, true);
    focusCheckedOption(menuRef);

    onCleanup(() => {
      document.removeEventListener("keydown", closeMenuOnEscape, true);
    });
  });

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
      >
        {describeBrainPill(state())}
        <span class={styles.caret} aria-hidden="true">
          ▾
        </span>
      </button>
      <Show when={menuOpen()}>
        <div
          ref={menuRef}
          role="menu"
          aria-label="Brain"
          data-testid="jarvis-brain-menu"
          class={styles.menu}
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
                  {jarvisBrainName(brain)}
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

/** Focus the menu's checked item, or its first enabled one when the checked
 * item is disabled (a disabled button cannot take focus). */
function focusCheckedOption(menu: HTMLElement | undefined): void {
  const target =
    menu?.querySelector<HTMLButtonElement>(
      '[role="menuitemradio"][aria-checked="true"]:not(:disabled)',
    ) ??
    menu?.querySelector<HTMLButtonElement>(
      '[role="menuitemradio"]:not(:disabled)',
    );
  target?.focus();
}
