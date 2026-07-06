import type { CSSProperties, ReactElement } from "react";

import type { ServiceRowVm } from "./servicesVm";

import styles from "./ServiceHealth.module.css";

/**
 * One service-health row — status dot, name, utilisation bar (--bar-pct),
 * latency, and uptime. Colour lives on data-status; CSS paints it. Ported
 * from PROTO Services/ServiceRow.tsx, generalised to a real "down" status
 * (the prototype only modelled ONLINE/DEGRADED) and fed by the pure
 * servicesVm row instead of a static seed.
 */
export function ServiceRow({ row }: ServiceRowProps): ReactElement {
  return (
    <div className={styles.row} data-status={row.status}>
      <span className={styles.dot} />
      <span className={styles.name}>{row.name}</span>
      <span className={styles.track}>
        <span
          className={styles.fill}
          style={
            // eslint-disable-next-line no-restricted-syntax -- runtime utilisation-bar width via CSS custom property; static CSS can't express a per-row value
            { "--bar-pct": `${row.barPct}%` } as CSSProperties
          }
        />
      </span>
      <span className={styles.lat}>{row.latencyLabel}</span>
      <span className={styles.up}>{row.uptimeLabel}</span>
    </div>
  );
}

export interface ServiceRowProps {
  row: ServiceRowVm;
}
