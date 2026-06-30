import type { ReactElement } from "react";

import styles from "#/shell/Header/Nav.module.css";
import type { Tab } from "#/shell/Header/useMenus";

export interface NavProps {
  tab: Tab;
  onSelect(tab: Tab): void;
}

type NavItem = { key: Tab; label: string };

const NAV_ITEMS: NavItem[] = [
  { key: "fx", label: "FX" },
  { key: "credit", label: "CREDIT" },
  { key: "equities", label: "EQUITIES" },
  { key: "admin", label: "ADMIN" },
];

export function Nav(props: NavProps): ReactElement {
  const { tab, onSelect } = props;
  return (
    <nav aria-label="Primary" className={styles.nav}>
      {NAV_ITEMS.map((item) => {
        return (
          <button
            key={item.key}
            type="button"
            className={styles.item}
            data-active={String(tab === item.key)}
            onClick={() => {
              onSelect(item.key);
            }}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
