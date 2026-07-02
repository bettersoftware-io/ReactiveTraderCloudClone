import type { ReactElement } from "react";

import styles from "#/admin/Kpis/KpiRow.module.css";
import type { AdminKpi } from "#/admin/types";

export interface KpiSparklineProps {
  kpi: AdminKpi;
}

// PROTO L695: a faint sparkline pinned to the card's lower edge; the stroke
// colour matches the KPI value (set in CSS via data-kpi/data-warn).
export function KpiSparkline(props: KpiSparklineProps): ReactElement {
  const { kpi } = props;

  return (
    <svg
      className={styles.spark}
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        className={styles.line}
        data-kpi={kpi.key}
        data-warn={String(kpi.warn)}
        points={kpi.spark}
      />
    </svg>
  );
}
