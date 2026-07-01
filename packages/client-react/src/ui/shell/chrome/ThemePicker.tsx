import type { CSSProperties, ReactElement } from "react";

import { THEME_SKINS } from "@rtc/domain";

import { ThemeToggle } from "../theme/ThemeToggle";
import { themeTokens } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

import styles from "./ThemePicker.module.css";

/**
 * Theme picker — composes the REUSED `ThemeToggle` (the light/dark mode control,
 * which carries the `theme-toggle` testid + aria-label the e2e theme scenario
 * pins) with a skin selector over `THEME_SKINS`. Both write through the real
 * theme seam (`useTheme().setSkin` + `ThemeToggle`'s `toggleMode`), so the
 * ThemeProvider repaints `:root` and `document.documentElement.dataset.{skin,mode}`.
 *
 * Skin rows port the prototype theme dropdown (Reactive Trader.dc.html:147-159):
 * a two-swatch chip (accent / accent-2) per skin + the selected-row check mark.
 * The swatch colours are the only inline styles — computed `--custom-property`
 * geometry values, which the dumb-UI CSS-module rule permits.
 */
export function ThemePicker(): ReactElement {
  const { skin, setSkin, mode } = useTheme();

  return (
    <div className={styles.picker} data-testid="skin-picker">
      <span className={styles.heading}>THEME</span>
      <div className={styles.skins} role="listbox" aria-label="Theme skin">
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
                setSkin(s);
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
              <span className={styles.skinName}>{s}</span>
              <span className={styles.mark}>{active ? "✓" : ""}</span>
            </button>
          );
        })}
      </div>
      <ThemeToggle />
    </div>
  );
}
