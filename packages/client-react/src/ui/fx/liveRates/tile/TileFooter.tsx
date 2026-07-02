import type { ReactElement } from "react";

import styles from "./TileFooter.module.css";

export function TileFooter({
  spotDate,
  notional,
  baseCurrency,
}: TileFooterProps): ReactElement {
  return (
    <div className={styles.footer}>
      <span className={styles.spotDate}>SPT {spotDate}</span>
      <span className={styles.notional}>
        {notional} {baseCurrency}
      </span>
    </div>
  );
}

interface TileFooterProps {
  spotDate: string;
  notional: string;
  baseCurrency: string;
}
