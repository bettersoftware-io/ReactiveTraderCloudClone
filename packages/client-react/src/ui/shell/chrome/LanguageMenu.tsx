// DECORATIVE — cosmetic HUD chrome, intentionally not wired to any port (spec: decorative-but-dead is allowed and explicit).
// The language list below is a fixed, uncontrolled list (Reactive Trader.dc.html:790):
// there is no i18n backend, so picking a language does nothing but relabel the
// trigger — presence only.
import type { ReactElement } from "react";
import { useState } from "react";

import styles from "./HeaderChrome.module.css";

/**
 * Standalone language menu — split out of the old AccountMenu language row
 * (prototype account panel, Reactive Trader.dc.html:790) into its own header
 * control, following the same menuAnchor/dropdown/trigger pattern as
 * AccountMenu. The trigger shows the selected code (`EN ▾` by default);
 * opening it lists every language with a checkmark on the active one.
 */
export function LanguageMenu(): ReactElement {
  const [selected, setSelected] = useState<LanguageCode>("EN");
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.menuAnchor}>
      <button
        type="button"
        data-testid="language-toggle"
        aria-label="Language"
        aria-expanded={open}
        className={styles.langTrigger}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span>{selected}</span>
        <span className={styles.caret}>▾</span>
      </button>
      {open ? (
        <div
          data-testid="language-panel"
          className={styles.dropdown}
          role="menu"
        >
          <div className={styles.dropdownHead}>
            <span className={styles.dropdownTitle}>LANGUAGE</span>
          </div>
          {LANGUAGES.map((lang) => {
            const active = lang.code === selected;
            return (
              <button
                key={lang.code}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                data-testid={`language-option-${lang.code}`}
                data-active={active ? "true" : "false"}
                className={styles.langOption}
                onClick={() => {
                  setSelected(lang.code);
                  setOpen(false);
                }}
              >
                <span>{lang.label}</span>
                <span className={styles.mark}>{active ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>
      ) : null}
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
