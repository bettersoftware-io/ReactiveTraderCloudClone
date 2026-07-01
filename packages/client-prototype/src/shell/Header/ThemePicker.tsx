import type { CSSProperties, ReactElement } from "react";

import { themeNames } from "#/mock/shellData";
import type { Skin } from "#/mock/types";
import styles from "#/shell/Header/ThemePicker.module.css";
import type { MenusApi } from "#/shell/Header/useMenus";
import { themesDark } from "#/theme/tokens";
import { useTheme } from "#/theme/useTheme";

export interface ThemePickerProps {
  menus: MenusApi;
}

const SKINS: Skin[] = ["holo", "holo3d", "terminal", "terminal3d", "neon"];

export function ThemePicker(props: ThemePickerProps): ReactElement {
  const { menus } = props;
  const { skin, setSkin } = useTheme();
  return (
    <div className={styles.picker}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Theme picker"
        onClick={() => {
          menus.toggle("theme");
        }}
      >
        <span className={styles.triggerSwatch} />
        <span className={styles.triggerLabel}>{themeNames[skin]}</span>
        <span className={styles.triggerChevron}>{"▾"}</span>
      </button>
      {menus.open === "theme" && (
        <div className={styles.dropdown}>
          <div className={styles.dropHeader}>THEME</div>
          {SKINS.map((s) => {
            const swatch = {
              "--sw-a": themesDark[s].accent,
              "--sw-b": themesDark[s].accent2,
            } as CSSProperties;
            return (
              <button
                key={s}
                type="button"
                className={styles.row}
                data-active={String(skin === s)}
                style={swatch}
                onClick={() => {
                  setSkin(s);
                  menus.close();
                }}
              >
                <span className={styles.rowInner}>
                  <span className={styles.swatches}>
                    <span className={styles.swatchA} />
                    <span className={styles.swatchB} />
                  </span>
                  {themeNames[s]}
                </span>
                <span className={styles.check}>{skin === s ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
