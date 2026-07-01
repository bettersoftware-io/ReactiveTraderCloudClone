import type { ReactElement } from "react";

import styles from "#/fx/Positions/ExposureRows.module.css";
import { EXPOSURE } from "#/fx/Positions/positionsData";

// PROTO 523: the same exposures listed as ccy | amount rows beneath the cluster.
export function ExposureRows(): ReactElement {
  return (
    <div>
      {EXPOSURE.map((e) => {
        const sign = e.positive ? "pos" : "neg";
        return (
          <div className={styles.row} key={e.ccy}>
            <span className={styles.ccy}>{e.ccy}</span>
            <span className={styles.amt} data-sign={sign}>
              {e.amt}
            </span>
          </div>
        );
      })}
    </div>
  );
}
