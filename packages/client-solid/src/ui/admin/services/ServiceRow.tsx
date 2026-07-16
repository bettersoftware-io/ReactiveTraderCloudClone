import type { JSX } from "solid-js";

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
export function ServiceRow(props: ServiceRowProps): JSX.Element {
  return (
    <div class={styles.row} data-status={props.row.status}>
      <span class={styles.dot} />
      <span class={styles.name}>{props.row.name}</span>
      <span class={styles.track}>
        <span
          class={styles.fill}
          // eslint-disable-next-line no-restricted-syntax -- runtime health-bar geometry + colour ramp; the scaleX must be a literal (scaleX(var(--x)) transitions never composite — docs/performance.md T5)
          style={{
            transform: `scaleX(${props.row.barPct / 100})`,
            "--health": String(props.row.health),
          }}
        />
      </span>
      <span class={styles.lat}>{props.row.latencyLabel}</span>
      <span class={styles.up}>{props.row.uptimeLabel}</span>
    </div>
  );
}

export interface ServiceRowProps {
  row: ServiceRowVm;
}
