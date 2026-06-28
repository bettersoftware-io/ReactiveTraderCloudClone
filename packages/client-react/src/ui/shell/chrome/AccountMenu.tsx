import type { ReactElement } from "react";
import { useState } from "react";

import { useHooks } from "#/ui/hooks/useHooks";

import styles from "./HeaderChrome.module.css";

// DECORATIVE — cosmetic HUD chrome, intentionally not wired to any port (spec: decorative-but-dead is allowed and explicit).
// The language selector below is a fixed, uncontrolled list (Reactive Trader.dc.html:773):
// there is no i18n backend, so picking a language does nothing — presence only.
const LANGUAGES = ["EN", "中文", "日本", "DE", "FR", "ES"];

/**
 * Account menu — the account section is REAL chrome wired to the session seam
 * (`useSession`): it shows the signed-in operator's initials, name and role from
 * the SessionPresenter. The language selector is decorative (see note above).
 * Opening/closing the panel is local view state.
 */
export function AccountMenu(): ReactElement {
  const { useSession } = useHooks();
  const { state, lock } = useSession();
  const { user } = state;
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.menuAnchor}>
      <button
        type="button"
        data-testid="account-toggle"
        aria-label="Account"
        aria-expanded={open}
        className={styles.accountTrigger}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span className={styles.avatar}>{user.initials}</span>
        <span className={styles.caret}>▾</span>
      </button>
      {open ? (
        <div
          data-testid="account-panel"
          className={styles.dropdown}
          role="menu"
        >
          <div className={styles.accountHead}>
            <span className={styles.avatarLarge}>{user.initials}</span>
            <span className={styles.accountIdentity}>
              <span className={styles.accountName}>{user.name}</span>
              <span className={styles.accountRole}>{user.role}</span>
            </span>
          </div>
          <div className={styles.accountMeta}>
            <span className={styles.accountMetaKey}>TRADER ID</span>
            <span className={styles.accountMetaVal}>{user.id}</span>
          </div>
          <label className={styles.langRow}>
            <span className={styles.accountMetaKey}>LANGUAGE</span>
            <select
              data-testid="language-select"
              className={styles.langSelect}
              defaultValue="EN"
              aria-label="Language"
            >
              {LANGUAGES.map((lang) => {
                return (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                );
              })}
            </select>
          </label>
          {/* Real chrome: locks the session through the `useSession` seam,
              raising the LockScreen overlay (prototype account menu → lock). */}
          <button
            type="button"
            data-testid="account-lock"
            className={styles.lockButton}
            role="menuitem"
            onClick={() => {
              setOpen(false);
              lock();
            }}
          >
            LOCK SESSION
          </button>
        </div>
      ) : null}
    </div>
  );
}
