import type { ReactElement } from "react";

import styles from "#/admin/Kpis/KpiRow.module.css";
import { KpiSparkline } from "#/admin/Kpis/KpiSparkline";
import type { AdminKpi } from "#/admin/types";

export interface KpiCardProps {
  kpi: AdminKpi;
}

// PROTO L687-696: one KPI card — label, glowing value + unit, trend delta, and a
// bottom sparkline. Colour state is carried on data-* attributes (CSS colours it).
export function KpiCard(props: KpiCardProps): ReactElement {
  const { kpi } = props;

  return (
    <div className={styles.card}>
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
