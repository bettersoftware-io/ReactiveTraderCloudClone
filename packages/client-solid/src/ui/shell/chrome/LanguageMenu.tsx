// DECORATIVE — cosmetic HUD chrome, intentionally not wired to any port (spec: decorative-but-dead is allowed and explicit).
// The language list below is a fixed, uncontrolled list (Reactive Trader.dc.html:790):
// there is no i18n backend, so picking a language does nothing but relabel the
// trigger — presence only.
import type { JSX } from "solid-js";
import { createSignal, For, Show } from "solid-js";

import styles from "./HeaderChrome.module.css";

/**
 * Standalone language menu — split out of the old AccountMenu language row
 * (prototype account panel, Reactive Trader.dc.html:790) into its own header
 * control, following the same menuAnchor/dropdown/trigger pattern as
 * AccountMenu. The trigger shows the selected code (`EN ▾` by default);
 * opening it lists every language with a checkmark on the active one.
 */
export function LanguageMenu(): JSX.Element {
  const [selected, setSelected] = createSignal<LanguageCode>("EN");
  const [open, setOpen] = createSignal(false);

  return (
    <div class={styles.menuAnchor}>
      <button
        type="button"
        data-testid="language-toggle"
        aria-label="Language"
        aria-expanded={open()}
        class={styles.langTrigger}
        onClick={() => {
          setOpen(!open());
        }}
      >
        <svg
          viewBox="0 0 24 24"
          class={styles.globe}
          aria-hidden={true}
          fill="none"
          stroke="var(--text-secondary)"
          stroke-width="1.5"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
        </svg>
        <span>{selected()}</span>
        <span class={styles.caret}>▾</span>
      </button>
      <Show when={open()}>
        <div data-testid="language-panel" class={styles.dropdown} role="menu">
          <div class={styles.dropdownHead}>
            <span class={styles.dropdownTitle}>LANGUAGE</span>
          </div>
          <For each={LANGUAGES}>
            {(lang: Language) => {
              function active(): boolean {
                return lang.code === selected();
              }

              return (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={active()}
                  data-testid={`language-option-${lang.code}`}
                  data-active={active() ? "true" : "false"}
                  class={styles.langOption}
                  onClick={() => {
                    setSelected(lang.code);
                    setOpen(false);
                  }}
                >
                  <span>{lang.label}</span>
                  <span class={styles.mark}>{active() ? "✓" : ""}</span>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

type LanguageCode = "EN" | "中文" | "日本" | "DE" | "FR" | "ES";

interface Language {
  code: LanguageCode;
  label: string;
}

const LANGUAGES: readonly Language[] = [
  { code: "EN", label: "English" },
  { code: "中文", label: "中文 (简体)" },
  { code: "日本", label: "日本語" },
  { code: "DE", label: "Deutsch" },
  { code: "FR", label: "Français" },
  { code: "ES", label: "Español" },
];
