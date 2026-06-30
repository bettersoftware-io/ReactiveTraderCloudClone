import type { ChangeEvent, ReactElement } from "react";

import type { Skin } from "#/mock/types";
import styles from "#/shell/ThemeControls.module.css";
import { useTheme } from "#/theme/useTheme";

const SKINS: Skin[] = ["holo", "holo3d", "terminal", "terminal3d", "neon"];

export function ThemeControls(): ReactElement {
  const { skin, mode, setSkin, toggleMode } = useTheme();
  return (
    <div className={styles.controls}>
      <select
        className={styles.select}
        aria-label="Theme skin"
        value={skin}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
          setSkin(e.target.value as Skin);
        }}
      >
        {SKINS.map((s) => {
          return (
            <option key={s} value={s}>
              {s}
            </option>
          );
        })}
      </select>
      <button
        type="button"
        aria-label="Toggle dark or light mode"
        className={styles.modeToggle}
        onClick={toggleMode}
      >
        {mode === "dark" ? "☾" : "☀"}
      </button>
    </div>
  );
}
