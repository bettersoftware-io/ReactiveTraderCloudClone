import type { JSX } from "solid-js";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";

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
export function ThemePicker(): JSX.Element {
  const { skin, setSkin, mode } = useTheme();
  const [open, setOpen] = createSignal(false);
  let anchorEl!: HTMLDivElement;

  createEffect(() => {
    if (!open()) {
      return;
    }

    function handlePointerDown(event: MouseEvent): void {
      if (!anchorEl.contains(event.target as Node)) {
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

    onCleanup(() => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    });
  });

  function selectSkin(next: ThemeSkin): void {
    setSkin(next);
    setOpen(false);
  }

  return (
    <div class={styles.picker}>
      <ThemeToggle />
      <div class={styles.anchor} ref={anchorEl}>
        <button
          type="button"
          data-testid="skin-picker"
          aria-haspopup="listbox"
          aria-expanded={open()}
          aria-label="Theme skin"
          class={styles.trigger}
          onClick={() => {
            setOpen(!open());
          }}
          style={
            // eslint-disable-next-line no-restricted-syntax -- runtime theme swatch colors via CSS custom properties; static CSS can't express them
            {
              "--swatch-1": themeTokens[skin()][mode()]["--accent-primary"],
              "--swatch-2": themeTokens[skin()][mode()]["--accent-2"],
            }
          }
        >
          <span class={styles.swatches}>
            <span class={styles.swatchA} />
            <span class={styles.swatchB} />
          </span>
          <span class={styles.skinName}>{SKIN_LABEL[skin()]}</span>
          <span class={styles.caret}>▾</span>
        </button>
        <Show when={open()}>
          <div class={styles.menu} role="listbox" aria-label="Theme skin">
            <span class={styles.heading}>THEME</span>
            <For each={THEME_SKINS}>
              {(s: ThemeSkin) => {
                function active(): boolean {
                  return s === skin();
                }

                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={active()}
                    data-skin={s}
                    data-active={active() ? "true" : "false"}
                    class={styles.skinRow}
                    onClick={() => {
                      selectSkin(s);
                    }}
                    style={
                      // eslint-disable-next-line no-restricted-syntax -- runtime theme swatch colors via CSS custom properties; static CSS can't express them
                      {
                        "--swatch-1":
                          themeTokens[s][mode()]["--accent-primary"],
                        "--swatch-2": themeTokens[s][mode()]["--accent-2"],
                      }
                    }
                  >
                    <span class={styles.swatches}>
                      <span class={styles.swatchA} />
                      <span class={styles.swatchB} />
                    </span>
                    <span class={styles.skinName}>{SKIN_LABEL[s]}</span>
                    <span class={styles.mark}>{active() ? "✓" : ""}</span>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>
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
