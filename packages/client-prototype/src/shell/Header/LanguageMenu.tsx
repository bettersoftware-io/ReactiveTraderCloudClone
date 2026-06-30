import type { ReactElement } from "react";

import { languages } from "#/mock/shellData";
import styles from "#/shell/Header/LanguageMenu.module.css";
import type { MenusApi } from "#/shell/Header/useMenus";

export interface LanguageMenuProps {
  menus: MenusApi;
  lang: string;
  onSelectLang(code: string): void;
}

export function LanguageMenu(props: LanguageMenuProps): ReactElement {
  const { menus, lang, onSelectLang } = props;
  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Language"
        onClick={() => {
          menus.toggle("lang");
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className={styles.globe}
          aria-hidden={true}
          fill="none"
          stroke="var(--dim)"
          strokeWidth="1.5"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
        </svg>
        <span className={styles.triggerLabel}>{lang}</span>
        <span className={styles.triggerChevron}>{"▾"}</span>
      </button>
      {menus.open === "lang" && (
        <div className={styles.dropdown}>
          {languages.map((l) => {
            const active = lang === l.code;
            return (
              <button
                key={l.code}
                type="button"
                className={styles.langRow}
                data-active={String(active)}
                onClick={() => {
                  onSelectLang(l.code);
                  menus.close();
                }}
              >
                <span>{l.label}</span>
                <span className={styles.check}>{active ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
