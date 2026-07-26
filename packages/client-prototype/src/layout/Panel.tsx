import type { ReactElement, ReactNode } from "react";

import styles from "#/layout/Panel.module.css";

// Generic over the caller's own panel-id union (e.g. FX's `PanelId`, credit's
// `CreditPanelId`) so `id`/`maxPanel`/`onToggleMax` all agree on one concrete
// type per screen, instead of widening to `string` — property syntax (unlike
// the method syntax this replaced) checks `onToggleMax` contravariantly, so a
// screen's narrower `toggleMax(id: XPanelId)` would otherwise no longer be
// assignable here.
export interface PanelProps<TId extends string = string> {
  id: TId;
  head: ReactElement;
  children: ReactNode;
  // Only meaningful (and only required by callers) when `maximizable` is
  // true — a non-maximizable panel (e.g. credit's New RFQ form) has no
  // `maxPanel` id of its own to compare against and nothing to toggle.
  maxPanel?: TId | null;
  onToggleMax?: (id: TId) => void;
  headControls?: ReactNode;
  headAccessory?: ReactNode;
  maximizable?: boolean;
}

export function Panel<TId extends string = string>(
  props: PanelProps<TId>,
): ReactElement {
  const {
    id,
    head,
    children,
    maxPanel = null,
    onToggleMax,
    headControls,
    headAccessory,
    maximizable = true,
  } = props;
  const isMax = maxPanel === id;

  function toggleMaxPanel(): void {
    onToggleMax?.(id);
  }

  return (
    <div className={styles.panel} data-max={String(isMax)}>
      <div className={styles.head}>
        <span className={styles.label}>{head}</span>
        {headControls != null ? (
          <div className={styles.controls}>{headControls}</div>
        ) : null}
        {headAccessory != null ? (
          <span className={styles.accessory} aria-hidden="true">
            {headAccessory}
          </span>
        ) : null}
        {maximizable ? (
          <button
            type="button"
            className={styles.maxBtn}
            aria-label="Maximize"
            title="Maximize"
            onClick={toggleMaxPanel}
          >
            {isMax ? "⧉" : "⛶"}
          </button>
        ) : null}
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
