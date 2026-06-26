import type { ChangeEvent, ReactElement } from "react";

import { THEME_SKINS, type ThemeSkin } from "@rtc/domain";

import { useTheme } from "./useTheme";

import styles from "./SkinPicker.module.css";

export function SkinPicker(): ReactElement {
  const { skin, setSkin } = useTheme();
  return (
    <select
      data-testid="skin-picker"
      className={styles.picker}
      value={skin}
      aria-label="Theme skin"
      onChange={(e: ChangeEvent<HTMLSelectElement>): void => {
        setSkin(e.target.value as ThemeSkin);
      }}
    >
      {THEME_SKINS.map((s) => {
        return (
          <option key={s} value={s}>
            {s}
          </option>
        );
      })}
    </select>
  );
}
