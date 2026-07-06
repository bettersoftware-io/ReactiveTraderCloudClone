import type { ReactElement } from "react";

import { AdminPanel } from "./AdminPanel";
import { IncidentControls } from "./IncidentControls";
import { KpiRow } from "./kpis/KpiRow";
import { LatencyHistogram } from "./LatencyHistogram";
import { LiveEventLog } from "./LiveEventLog";
import { ServiceTopologyGraph } from "./ServiceTopologyGraph";
import { SessionsPanel } from "./SessionsPanel";
import { ServiceHealth } from "./services/ServiceHealth";
import { ThroughputChart } from "./ThroughputChart";

import styles from "./AdminDashboard.module.css";

/**
 * Admin observability dashboard — composes the telemetry cards (KPI strip,
 * charts, topology, service health, live log, sessions) plus the break-glass
 * incident controls and the retained throughput-control card (AdminPanel) in
 * a CSS grid. Mounted via the PanelRegistry "admin-dashboard" entry,
 * mirroring Phase 4's Equities panel. Full regrid (dropping this generic
 * Card wrapper for the KPI/chart/health/log cards, which now all render
 * their own internal heads — a temporary double-header until then) is a
 * later task.
 */
export function AdminDashboard(): ReactElement {
  return (
    <div className={styles.dashboard}>
      <Card title="METRICS" className={styles.kpiCard}>
        <KpiRow />
      </Card>
      <Card title="THROUGHPUT" className={styles.throughputCard}>
        <ThroughputChart />
      </Card>
      <Card title="LATENCY" className={styles.latencyCard}>
        <LatencyHistogram />
      </Card>
      <Card title="SERVICE TOPOLOGY" className={styles.topologyCard}>
        <ServiceTopologyGraph />
      </Card>
      <Card title="EVENT LOG" className={styles.logCard}>
        <LiveEventLog />
      </Card>
      <Card title="SERVICE HEALTH" className={styles.healthCard}>
        <ServiceHealth />
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
