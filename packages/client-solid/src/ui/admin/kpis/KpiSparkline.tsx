import type { JSX } from "solid-js";

import type { AdminKpiVm } from "@rtc/client-core";

import styles from "./KpiRow.module.css";

/**
 * Faint sparkline pinned to a KPI card's lower edge; the stroke colour matches
 * the card's value colour, set in CSS via data-kpi/data-warn on the path
 * itself. PROTO Kpis/KpiSparkline.tsx — geometry comes from kpisVm's smoothed
 * spark path `d` string (client-core), this component only paints it.
 */
export function KpiSparkline(props: KpiSparklineProps): JSX.Element {
  return (
    <svg
      class={styles.spark}
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        class={styles.line}
        data-kpi={props.kpi.key}
        data-warn={String(props.kpi.warn)}
        d={props.kpi.spark}
      />
    </svg>
  );
}

export interface KpiSparklineProps {
  kpi: AdminKpiVm;
}
