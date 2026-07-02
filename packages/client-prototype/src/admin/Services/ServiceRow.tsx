import type { CSSProperties, ReactElement } from "react";

import styles from "#/admin/Services/ServiceHealth.module.css";
import type { Service } from "#/admin/types";

export interface ServiceRowProps {
  service: Service;
}

// PROTO L710: one service row — status dot, name, utilisation bar (--bar-pct),
// latency, and uptime. Status colour lives on data-status (CSS colours it).
export function ServiceRow(props: ServiceRowProps): ReactElement {
  const { service } = props;
  const fillStyle = { "--bar-pct": `${service.barPct}%` } as CSSProperties;

  return (
    <div className={styles.row} data-status={service.status}>
      <span className={styles.dot} />
      <span className={styles.name}>{service.name}</span>
      <span className={styles.track}>
        <span className={styles.fill} style={fillStyle} />
      </span>
      <span className={styles.lat}>{service.lat}</span>
      <span className={styles.up}>{service.up}</span>
    </div>
  );
}
