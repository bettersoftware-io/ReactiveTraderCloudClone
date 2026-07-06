import type { ReactElement } from "react";

import { kpisVm } from "@rtc/client-core";
import { useViewModel } from "@rtc/react-bindings";

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
export function KpiRow(): ReactElement {
  const { useMetrics, useSessionCountSeries } = useViewModel();
  const { throughput, latency, errorRate } = useMetrics();
  const sessions = useSessionCountSeries();
  const kpis = kpisVm({ throughput, latency, errorRate, sessions });

  return (
    <div data-testid="admin-kpi-row" className={styles.row}>
      {kpis.map((kpi) => {
        return <KpiCard key={kpi.key} kpi={kpi} />;
      })}
    </div>
  );
}
