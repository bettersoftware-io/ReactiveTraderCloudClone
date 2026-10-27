import {
  type ReactElement,
  type KeyboardEvent as ReactKeyboardEvent,
  useRef,
  useState,
} from "react";

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
 * Escape inside the menu closes the menu only: the overlay's own Escape
 * listener lives on `document` and returns early for a defaultPrevented key.
 */
export function JarvisBrainPill(): ReactElement {
  const { useJarvis, useJarvisPreferences } = useViewModel();
  const { state } = useJarvis();
  const { setBrain } = useJarvisPreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);

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

  function closeMenuOnEscape(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.key !== "Escape" || !menuOpen) {
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
    <div className={styles.wrap}>
      <button
        ref={pillRef}
        type="button"
        data-testid="jarvis-brain-pill"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={styles.pill}
        onClick={toggleMenu}
        onKeyDown={closeMenuOnEscape}
      >
        {describeBrainPill(state)}
        <span className={styles.caret} aria-hidden="true">
          ▾
        </span>
      </button>
      {menuOpen ? (
        <div
          role="menu"
          aria-label="Brain"
          data-testid="jarvis-brain-menu"
          className={styles.menu}
          onKeyDown={closeMenuOnEscape}
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
