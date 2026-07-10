import type { CSSProperties, ReactElement } from "react";

import type { ServiceRowVm } from "./servicesVm";

import styles from "./ServiceHealth.module.css";

/**
 * One service-health row — status dot, name, health bar (literal scaleX
 * geometry, --health colour ramp), latency, and uptime. Dot/status colours live on
 * data-status; the bar's fill blends continuously green→yellow→orange→red as
 * --health falls, all in CSS. Ported from PROTO Services/ServiceRow.tsx,
 * generalised to a real "down" status (the prototype only modelled
 * ONLINE/DEGRADED) and fed by the pure servicesVm row instead of a static
 * seed.
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
            // eslint-disable-next-line no-restricted-syntax -- runtime health-bar geometry + colour ramp; the scaleX must be a literal (scaleX(var(--x)) transitions never composite — docs/performance.md T5)
            {
              transform: `scaleX(${row.barPct / 100})`,
              "--health": String(row.health),
            } as CSSProperties
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
