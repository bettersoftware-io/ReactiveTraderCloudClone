import type { JSX } from "solid-js";
import { createMemo, For } from "solid-js";

import { type AdminKpiVm, kpisVm } from "@rtc/client-core";
import { useViewModel } from "@rtc/solid-bindings";

import { KpiCard } from "./KpiCard";

import styles from "./KpiRow.module.css";

/**
 * The 4-up KPI strip — throughput, P99 latency, error rate, active sessions.
 * Each card's value/unit/delta/warn/sparkline is computed by the shared
 * kpisVm (client-core) from the live metric windows (useMetrics) plus the
 * session-count series (useSessionCountSeries). PROTO Kpis/KpiRow.tsx received
 * `kpis` as a prop from the screen-level useAdminMetrics; here KpiRow is that
 * composition point, wired to the real telemetry seam.
 */
export function KpiRow(): JSX.Element {
  const { useMetrics, useSessionCountSeries } = useViewModel();
  const { throughput, latency, errorRate } = useMetrics();
  const sessions = useSessionCountSeries();

  const kpis = createMemo((): readonly AdminKpiVm[] => {
    return kpisVm({
      throughput: throughput(),
      latency: latency(),
      errorRate: errorRate(),
      sessions: sessions(),
    });
  });

  return (
    <div data-testid="admin-kpi-row" class={styles.row}>
      <For each={kpis()}>
        {(kpi: AdminKpiVm) => {
          return <KpiCard kpi={kpi} />;
        }}
      </For>
    </div>
  );
}
