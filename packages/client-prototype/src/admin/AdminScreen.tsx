import type { ReactElement } from "react";

import styles from "#/admin/AdminScreen.module.css";
import { kpisVm, servicesVm, throughputVm } from "#/admin/adminVm";
import { LiveEvents } from "#/admin/Events/LiveEvents";
import { KpiRow } from "#/admin/Kpis/KpiRow";
import { LatencyHistogram } from "#/admin/Latency/LatencyHistogram";
import { ServiceHealth } from "#/admin/Services/ServiceHealth";
import { ThroughputChart } from "#/admin/Throughput/ThroughputChart";
import { useAdminMetrics } from "#/admin/useAdminMetrics";
import { Panel } from "#/layout/Panel";

const OBS_PANEL = "observability";

function noToggle(): void {}

// PROTO L682-720: the Admin / Observability screen — a single full-width panel
// (no dock/splits, not maximizable) over three rows: KPIs, charts, bottom.
export function AdminScreen(): ReactElement {
  const { metrics, events, latBars } = useAdminMetrics();
  const kpis = kpisVm(metrics);
  const throughput = throughputVm(metrics.tput);
  const services = servicesVm();

  return (
    <section className={styles.screen} data-testid="admin-screen">
      <Panel
        id={OBS_PANEL}
        maxPanel={null}
        onToggleMax={noToggle}
        maximizable={false}
        head={
          <div className={styles.head}>
            <span className={styles.title}>◈ Observability</span>
            <span className={styles.nominal}>● ALL SYSTEMS NOMINAL</span>
          </div>
        }
      >
        <div className={styles.body}>
          <KpiRow kpis={kpis} />
          <div className={styles.charts}>
            <ThroughputChart line={throughput.line} area={throughput.area} />
            <LatencyHistogram bars={latBars} />
          </div>
          <div className={styles.bottom}>
            <ServiceHealth services={services} />
            <LiveEvents events={events} />
          </div>
        </div>
      </Panel>
    </section>
  );
}
