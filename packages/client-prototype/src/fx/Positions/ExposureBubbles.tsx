import type { CSSProperties, ReactElement } from "react";

import styles from "#/fx/Positions/ExposureBubbles.module.css";
import { EXPOSURE } from "#/fx/Positions/positionsData";

// PROTO 519-521: the net-exposure bubble cluster — one circle per currency,
// diameter by |exposure|, a slowly spinning ring, a radial glow, and the
// ccy/amount label. Sign drives color; large bubbles get a bigger label.
export function ExposureBubbles(): ReactElement {
  return (
    <div className={styles.cluster}>
      {EXPOSURE.map((e) => {
        const sizeStyle = { "--bubble-size": `${e.size}px` } as CSSProperties;
        const sign = e.positive ? "pos" : "neg";
        return (
          <div
            className={styles.bubble}
            key={e.ccy}
            data-sign={sign}
            data-large={e.large ? "true" : "false"}
            style={sizeStyle}
          >
            <span className={styles.ring} data-sign={sign} />
            <span className={styles.glow} data-sign={sign} />
            <span className={styles.inner}>
              <span className={styles.ccy}>{e.ccy}</span>
              <span className={styles.amt}>{e.amt}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
