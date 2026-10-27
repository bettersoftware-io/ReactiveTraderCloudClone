import { type ReactElement, useEffect, useRef, useState } from "react";

import { describeBrainPill } from "@rtc/core-logic";
import {
  JARVIS_BRAIN_NAMES,
  JARVIS_BRAINS,
  type JarvisBrain,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import styles from "./JarvisBrainPill.module.css";

/**
 * The input-bar brain pill: the effective brain (and what is left of today's
 * budget) with a small menu to switch the saved brain. Offered brains follow
 * `JARVIS_BRAINS` order; a brain the active gate has removed is disabled, the
 * same rule as the Preferences Brain picker. The menu has no animation.
 *
 * While the menu is open, Escape closes the menu only, wherever focus is: a
 * `document` keydown listener in the CAPTURE phase runs before any bubble
 * listener (the overlay's own Escape listener among them), calls
 * `preventDefault()` + `stopPropagation()`, closes the menu and returns focus
 * to the pill. A key handler on the pill or the menu would miss the Escape
 * whenever focus sits elsewhere — Safari and macOS Firefox do not focus a
 * clicked button, and Chrome loses it to a click into the input. Opening the
 * menu moves focus to the checked item (the ARIA menu pattern).
 */
export function JarvisBrainPill(): ReactElement {
  const { useJarvis, useJarvisPreferences } = useViewModel();
  const { state } = useJarvis();
  const { setBrain } = useJarvisPreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const offered = JARVIS_BRAINS.filter((brain) => {
    return brain === "scripted" || state.brains.includes(brain);
  });

  function toggleMenu(): void {
    setMenuOpen((open) => {
      return !open;
    });
  }

  function closeMenuToPill(): void {
    setMenuOpen(false);
    pillRef.current?.focus();
  }

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    function closeMenuOnEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(false);
      pillRef.current?.focus();
    }

    document.addEventListener("keydown", closeMenuOnEscape, true);
    focusCheckedOption(menuRef.current);

    return () => {
      document.removeEventListener("keydown", closeMenuOnEscape, true);
    };
  }, [menuOpen]);

  function chooseBrain(brain: JarvisBrain) {
    return () => {
      setBrain(brain);
      closeMenuToPill();
    };
  }

  return (
    <div className={styles.wrap}>
      <button
        ref={pillRef}
        type="button"
        data-testid="jarvis-brain-pill"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={styles.pill}
        onClick={toggleMenu}
      >
        {describeBrainPill(state)}
        <span className={styles.caret} aria-hidden="true">
          ▾
        </span>
      </button>
      {menuOpen ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Brain"
          data-testid="jarvis-brain-menu"
          className={styles.menu}
        >
          {offered.map((brain) => {
            const checked = brain === state.effectiveBrain;
            const gated = state.gate?.gated.includes(brain) === true;

            return (
              <button
                key={brain}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                data-testid={`jarvis-brain-option-${brain}`}
                className={styles.option}
                disabled={gated}
                onClick={chooseBrain(brain)}
              >
                <span className={styles.mark} aria-hidden="true">
                  {checked ? "✓" : ""}
                </span>
                {JARVIS_BRAIN_NAMES[brain]}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Focus the menu's checked item, or its first enabled one when the checked
 * item is disabled (a disabled button cannot take focus). */
function focusCheckedOption(menu: HTMLElement | null): void {
  const target =
    menu?.querySelector<HTMLButtonElement>(
      '[role="menuitemradio"][aria-checked="true"]:not(:disabled)',
    ) ??
    menu?.querySelector<HTMLButtonElement>(
      '[role="menuitemradio"]:not(:disabled)',
    );
  target?.focus();
}
