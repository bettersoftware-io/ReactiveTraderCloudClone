import type { ReactElement } from "react";

import type { AdminKpiVm } from "@rtc/client-core";

import { KpiSparkline } from "./KpiSparkline";

import styles from "./KpiRow.module.css";

/**
 * One KPI card — label, glowing value + unit, trend delta, and a bottom
 * sparkline. Colour state is carried on data-* attributes; CSS colours it.
 * PROTO Kpis/KpiCard.tsx.
 */
export function KpiCard({ kpi }: KpiCardProps): ReactElement {
  return (
    <div data-testid={`admin-kpi-${kpi.key}`} className={styles.card}>
      <div className={styles.label}>{kpi.label}</div>
      <div className={styles.valueRow}>
        <span
          className={styles.value}
          data-kpi={kpi.key}
          data-warn={String(kpi.warn)}
        >
          {kpi.value}
        </span>
        <span className={styles.unit}>{kpi.unit}</span>
      </div>
      <div className={styles.delta} data-delta-up={String(kpi.deltaUp)}>
        {kpi.delta}
      </div>
      <KpiSparkline kpi={kpi} />
    </div>
  );
}

export interface KpiCardProps {
  kpi: AdminKpiVm;
}
