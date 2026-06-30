import type { CSSProperties, ReactElement } from "react";

import { notifSeed } from "#/mock/shellData";
import type { Notif } from "#/mock/types";
import styles from "#/shell/Header/Notifications.module.css";
import type { MenusApi } from "#/shell/Header/useMenus";

export interface NotificationsProps {
  menus: MenusApi;
}

export function Notifications(props: NotificationsProps): ReactElement {
  const { menus } = props;
  const count = notifSeed.length;
  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Notifications"
        onClick={() => {
          menus.toggle("notif");
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className={styles.bell}
          aria-hidden={true}
          fill="none"
          stroke="var(--dim)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        <span className={styles.badge}>{count}</span>
      </button>
      {menus.open === "notif" && (
        <div className={styles.dropdown}>
          <div className={styles.dropHeader}>
            <span className={styles.dropTitle}>NOTIFICATIONS</span>
            <span className={styles.dropCount}>{count} new</span>
          </div>
          <div className={styles.list}>
            {notifSeed.map((n) => {
              return <NotifRow key={`${n.t}-${n.tag}`} notif={n} />;
            })}
          </div>
          <button
            type="button"
            className={styles.markRead}
            onClick={() => {
              menus.close();
            }}
          >
            MARK ALL READ
          </button>
        </div>
      )}
    </div>
  );
}

// — private subcomponent ——————————————————————————————————————————————————————

interface NotifRowProps {
  notif: Notif;
}

function NotifRow(props: NotifRowProps): ReactElement {
  const { notif } = props;
  const tagStyle = { "--tag-color": notif.color } as CSSProperties;
  return (
    <div className={styles.notifRow}>
      <span className={styles.tag} style={tagStyle}>
        {notif.tag}
      </span>
      <div className={styles.notifBody}>
        <div className={styles.notifMsg}>{notif.msg}</div>
        <div className={styles.notifTime}>{notif.t}</div>
      </div>
    </div>
  );
}
