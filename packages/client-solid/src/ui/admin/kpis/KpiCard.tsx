import type { JSX } from "solid-js";

import type { AdminKpiVm } from "@rtc/client-core";

import { KpiSparkline } from "./KpiSparkline";

import styles from "./KpiRow.module.css";

/**
 * One KPI card — label, glowing value + unit, trend delta, and a bottom
 * sparkline. Colour state is carried on data-* attributes; CSS colours it.
 * PROTO Kpis/KpiCard.tsx.
 */
export function KpiCard(props: KpiCardProps): JSX.Element {
  return (
    <div data-testid={`admin-kpi-${props.kpi.key}`} class={styles.card}>
      <div class={styles.label}>{props.kpi.label}</div>
      <div class={styles.valueRow}>
        <span
          class={styles.value}
          data-kpi={props.kpi.key}
          data-warn={String(props.kpi.warn)}
        >
          {props.kpi.value}
        </span>
        <span class={styles.unit}>{props.kpi.unit}</span>
      </div>
      <div class={styles.delta} data-delta-up={String(props.kpi.deltaUp)}>
        {props.kpi.delta}
      </div>
      <KpiSparkline kpi={props.kpi} />
    </div>
  );
}

export interface KpiCardProps {
  kpi: AdminKpiVm;
}
