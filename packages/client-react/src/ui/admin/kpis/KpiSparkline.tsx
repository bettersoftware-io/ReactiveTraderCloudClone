import type { ReactElement } from "react";

import type { AdminKpiVm } from "@rtc/client-core";

import styles from "./KpiRow.module.css";

/**
 * Faint sparkline pinned to a KPI card's lower edge; the stroke colour matches
 * the card's value colour, set in CSS via data-kpi/data-warn on the polyline
 * itself. PROTO Kpis/KpiSparkline.tsx — geometry comes from kpisVm's spark
 * string (client-core), this component only paints it.
 */
export function KpiSparkline({ kpi }: KpiSparklineProps): ReactElement {
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

export interface KpiSparklineProps {
  kpi: AdminKpiVm;
}
