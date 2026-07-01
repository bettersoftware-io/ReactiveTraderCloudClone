import type { ReactElement, ReactNode } from "react";

import styles from "#/fx/layout/Panel.module.css";
import type { PanelId } from "#/fx/layout/useDockState";

export interface PanelProps {
  id: PanelId;
  head: ReactElement;
  children: ReactNode;
  maxPanel: PanelId | null;
  onToggleMax(id: PanelId): void;
  headAccessory?: ReactNode;
}

export function Panel(props: PanelProps): ReactElement {
  const { id, head, children, maxPanel, onToggleMax, headAccessory } = props;
  const isMax = maxPanel === id;

  function handleMaxClick(): void {
    onToggleMax(id);
  }

  return (
    <div className={styles.panel} data-max={String(isMax)}>
      <div className={styles.head}>
        {head}
        {headAccessory != null ? (
          <span className={styles.accessory} aria-hidden="true">
            {headAccessory}
          </span>
        ) : null}
        <button
          type="button"
          className={styles.maxBtn}
          aria-label="Maximize"
          title="Maximize"
          onClick={handleMaxClick}
        >
          {isMax ? "⤡" : "⤢"}
        </button>
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
