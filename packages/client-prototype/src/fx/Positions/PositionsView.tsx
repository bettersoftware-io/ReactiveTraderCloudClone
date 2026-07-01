import type { ReactElement } from "react";

import { ExposureBubbles } from "#/fx/Positions/ExposureBubbles";
import { ExposureRows } from "#/fx/Positions/ExposureRows";
import styles from "#/fx/Positions/PositionsView.module.css";

// PROTO 518-524: the Positions panel body — "Net Exposure" over the bubble
// cluster and the exposure list.
export function PositionsView(): ReactElement {
  return (
    <div className={styles.body}>
      <div className={styles.label}>Net Exposure</div>
      <ExposureBubbles />
      <ExposureRows />
    </div>
  );
}
