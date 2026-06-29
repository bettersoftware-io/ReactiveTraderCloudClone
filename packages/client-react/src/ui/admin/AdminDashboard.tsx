import type { ReactElement } from "react";

import { AdminPanel } from "./AdminPanel";
import { ErrorRatePanel } from "./ErrorRatePanel";
import { IncidentControls } from "./IncidentControls";
import { LatencyHistogram } from "./LatencyHistogram";
import { LiveEventLog } from "./LiveEventLog";
import { MetricGauges } from "./MetricGauges";
import { ServiceTopologyGraph } from "./ServiceTopologyGraph";
import { SessionsPanel } from "./SessionsPanel";
import { ThroughputChart } from "./ThroughputChart";

import styles from "./AdminDashboard.module.css";

interface CardProps {
  title: string;
  className: string;
  children: ReactElement;
}

function Card({ title, className, children }: CardProps): ReactElement {
  return (
    <section className={`${styles.card} ${className}`}>
      <header className={styles.cardHead}>{title}</header>
      <div className={styles.cardBody}>{children}</div>
    </section>
  );
}

/**
 * Admin observability dashboard — composes the telemetry cards (gauges, charts,
 * topology, sessions, live log) plus the break-glass incident controls and the
 * retained throughput-control card (AdminPanel) in a CSS grid. Mounted via the
 * PanelRegistry "admin-dashboard" entry, mirroring Phase 4's Equities panel.
 */
export function AdminDashboard(): ReactElement {
  return (
    <div className={styles.dashboard}>
      <Card title="METRICS" className={styles.gaugesCard}>
        <MetricGauges />
      </Card>
      <Card title="THROUGHPUT" className={styles.throughputCard}>
        <ThroughputChart />
      </Card>
      <Card title="LATENCY" className={styles.latencyCard}>
        <LatencyHistogram />
      </Card>
      <Card title="ERRORS" className={styles.errorCard}>
        <ErrorRatePanel />
      </Card>
      <Card title="SERVICE TOPOLOGY" className={styles.topologyCard}>
        <ServiceTopologyGraph />
      </Card>
      <Card title="EVENT LOG" className={styles.logCard}>
        <LiveEventLog />
      </Card>
      <Card title="SESSIONS" className={styles.sessionsCard}>
        <SessionsPanel />
      </Card>
      <Card title="INCIDENT CONTROLS" className={styles.incidentCard}>
        <IncidentControls />
      </Card>
      <Card title="THROUGHPUT CONTROL" className={styles.controlCard}>
        <AdminPanel />
      </Card>
    </div>
  );
}
