import type { CSSProperties, ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import { THEME_SKINS, type ThemeSkin } from "@rtc/domain";

import { ThemeToggle } from "../theme/ThemeToggle";
import { themeTokens } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import styles from "./ThemePicker.module.css";

/**
 * Theme picker — composes the REUSED `ThemeToggle` (the light/dark mode
 * control, which carries the `theme-toggle` testid + aria-label the e2e theme
 * scenario pins) with a compact skin dropdown over `THEME_SKINS` (PROTO
 * Reactive Trader.dc.html:155-166). Both write through the real theme seam
 * (`useTheme().setSkin` + `ThemeToggle`'s `cycleMode`), so the ThemeProvider
 * repaints `:root` and `document.documentElement.dataset.{skin,mode}`.
 *
 * The trigger (`skin-picker` testid) shows the active skin's two-swatch chip
 * + name; opening it reveals a "THEME" popover listing every skin as a
 * `role="option"` row (`data-skin` + `data-active`, ported from the old
 * segmented-buttons markup so the UI-contract page object keeps working
 * unchanged) with a checkmark on the active row. The open/close idiom follows
 * AccountMenu/NotificationsMenu's local `open` state + trigger click, extended
 * with outside-click + Escape to close — the compact dropdown, unlike the old
 * always-visible segmented row, needs an explicit dismissal path.
 */
export function ThemePicker(): ReactElement {
  const { skin, setSkin, mode } = useTheme();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent): void {
      if (!anchorRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function selectSkin(next: ThemeSkin): void {
    setSkin(next);
    setOpen(false);
  }

  const activeTokens = themeTokens[skin][mode];

  return (
    <div className={styles.picker}>
      <ThemeToggle />
      <div className={styles.anchor} ref={anchorRef}>
        <button
          type="button"
          data-testid="skin-picker"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Theme skin"
          className={styles.trigger}
          onClick={() => {
            setOpen((prev) => {
              return !prev;
            });
          }}
          style={
            // eslint-disable-next-line no-restricted-syntax -- runtime theme swatch colors via CSS custom properties; static CSS can't express them
            {
              "--swatch-1": activeTokens["--accent-primary"],
              "--swatch-2": activeTokens["--accent-2"],
            } as CSSProperties
          }
        >
          <span className={styles.swatches}>
            <span className={styles.swatchA} />
            <span className={styles.swatchB} />
          </span>
          <span className={styles.skinName}>{SKIN_LABEL[skin]}</span>
          <span className={styles.caret}>▾</span>
        </button>
        {open ? (
          <div className={styles.menu} role="listbox" aria-label="Theme skin">
            <span className={styles.heading}>THEME</span>
            {THEME_SKINS.map((s) => {
              const tokens = themeTokens[s][mode];
              const active = s === skin;
              return (
                <button
                  key={s}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-skin={s}
                  data-active={active ? "true" : "false"}
                  className={styles.skinRow}
                  onClick={() => {
                    selectSkin(s);
                  }}
                  style={
                    // eslint-disable-next-line no-restricted-syntax -- runtime theme swatch colors via CSS custom properties; static CSS can't express them
                    {
                      "--swatch-1": tokens["--accent-primary"],
                      "--swatch-2": tokens["--accent-2"],
                    } as CSSProperties
                  }
                >
                  <span className={styles.swatches}>
                    <span className={styles.swatchA} />
                    <span className={styles.swatchB} />
                  </span>
                  <span className={styles.skinName}>{SKIN_LABEL[s]}</span>
                  <span className={styles.mark}>{active ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Display label per skin, rendered proper-case exactly as written (PROTO
 *  shellData.ts `themeNames`, e.g. "Holo HUD ▾" — no CSS uppercasing).
 *  "Classic" is app-only; the rest match the prototype verbatim. */
const SKIN_LABEL: Record<ThemeSkin, string> = {
  classic: "Classic",
  holo: "Holo HUD",
  holo3d: "Holo HUD 3D",
  terminal: "Terminal",
  terminal3d: "Terminal 3D",
  neon: "Neon Grid",
};
