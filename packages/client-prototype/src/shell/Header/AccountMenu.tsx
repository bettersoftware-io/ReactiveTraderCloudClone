import type { ReactElement } from "react";

import { user } from "#/mock/shellData";
import styles from "#/shell/Header/AccountMenu.module.css";
import type { MenusApi } from "#/shell/Header/useMenus";

export interface AccountMenuProps {
  menus: MenusApi;
  onOpenPrefs(): void;
  onReboot(): void;
  onLogout(): void;
}

export function AccountMenu(props: AccountMenuProps): ReactElement {
  const { menus, onOpenPrefs, onReboot, onLogout } = props;
  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Account"
        onClick={() => {
          menus.toggle("user");
        }}
      >
        <div className={styles.hexWrap}>
          <svg viewBox="0 0 28 28" className={styles.hexSvg} aria-hidden={true}>
            <polygon
              points="14,1.5 25,7.75 25,20.25 14,26.5 3,20.25 3,7.75"
              fill="var(--chip)"
              stroke="var(--accent)"
              strokeWidth="1.3"
            />
          </svg>
          <span className={styles.initials}>{user.initials}</span>
        </div>
        <span className={styles.triggerChevron}>{"▾"}</span>
      </button>
      {menus.open === "user" && (
        <div className={styles.dropdown}>
          <div className={styles.identity}>
            <div className={styles.hexWrapLg}>
              <svg
                viewBox="0 0 28 28"
                className={styles.hexSvgLg}
                aria-hidden={true}
              >
                <polygon
                  points="14,1.5 25,7.75 25,20.25 14,26.5 3,20.25 3,7.75"
                  fill="var(--chip)"
                  stroke="var(--accent)"
                  strokeWidth="1.3"
                />
              </svg>
              <span className={styles.initialsLg}>{user.initials}</span>
            </div>
            <div className={styles.identityText}>
              <div className={styles.userName}>{user.name}</div>
              <div className={styles.userEmail}>{user.email}</div>
            </div>
          </div>
          <div className={styles.details}>
            <div className={styles.detailRow}>
              <span className={styles.detailKey}>TRADER ID</span>
              <span className={styles.detailVal}>{user.id}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailKey}>DESK</span>
              <span className={styles.detailVal}>{user.desk}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailKey}>CLEARANCE</span>
              <span className={styles.clearance}>{"LEVEL 4 · FULL"}</span>
            </div>
          </div>
          <button
            type="button"
            className={styles.actionRow}
            onClick={() => {
              onOpenPrefs();
              menus.close();
            }}
          >
            {"⚙ Preferences"}
          </button>
          <button
            type="button"
            className={styles.actionRow}
            onClick={() => {
              onReboot();
              menus.close();
            }}
          >
            {"⟳ Reboot HUD"}
          </button>
          <button
            type="button"
            className={styles.signOut}
            onClick={() => {
              onLogout();
              menus.close();
            }}
          >
            {"⏻ Sign Out"}
          </button>
        </div>
      )}
    </div>
  );
}
