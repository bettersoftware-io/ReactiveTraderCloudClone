import type { MouseEvent, ReactElement } from "react";

import styles from "#/equities/Chart/InstrumentTabs.module.css";
import type { EqSym } from "#/equities/types";

export interface InstrumentTabsProps {
  tabs: EqSym[];
  sel: EqSym;
  onSelect(sym: EqSym): void;
  onClose(sym: EqSym): void;
}

// PROTO L601: the open-instrument tab strip, each tab an active/idle symbol
// with a close affordance.
export function InstrumentTabs(props: InstrumentTabsProps): ReactElement {
  const { tabs, sel, onSelect, onClose } = props;

  return (
    <div className={styles.tabs}>
      {tabs.map((sym) => {
        return (
          <InstrumentTab
            key={sym}
            sym={sym}
            active={sym === sel}
            onSelect={onSelect}
            onClose={onClose}
          />
        );
      })}
    </div>
  );
}

interface InstrumentTabProps {
  sym: EqSym;
  active: boolean;
  onSelect(sym: EqSym): void;
  onClose(sym: EqSym): void;
}

function InstrumentTab(props: InstrumentTabProps): ReactElement {
  const { sym, active, onSelect, onClose } = props;

  function handleSelect(): void {
    onSelect(sym);
  }

  function handleClose(e: MouseEvent): void {
    e.stopPropagation();
    onClose(sym);
  }

  return (
    <button
      type="button"
      className={styles.tab}
      data-active={String(active)}
      onClick={handleSelect}
    >
      {sym}
      <span className={styles.close} onClick={handleClose} aria-hidden="true">
        ✕
      </span>
    </button>
  );
}
