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
 * Admin observability dashboard (PROTO AdminScreen.tsx `.body`) — a flex
 * column of rows: the KPI strip, a charts row (throughput + latency), a
 * health/events row, and a retained row of real-app extras the prototype
 * never modelled (service topology, sessions, break-glass incident
 * controls, throughput control). Mounted via the PanelRegistry
 * "admin-dashboard" entry, with its head registered separately
 * (AdminHead, appHeadRegistry).
 *
 * Kills the "double header" Tasks 2/3 flagged: KpiRow/ThroughputChart/
 * LatencyHistogram/ServiceHealth/LiveEventLog each render their OWN card
 * chrome (background/border/head) already, so they render bare here — no
 * wrapper. The four retained components have no such self-contained chrome
 * (ServiceTopologyGraph has no head at all; SessionsPanel/IncidentControls/
 * AdminPanel already render their own low-key label, restyled to the same
 * card-head tone in AdminPanel's case), so `RetainedCard` gives them a
 * shared shell — with an explicit title only for ServiceTopologyGraph,
 * which is the one that would otherwise be unlabeled.
 */
export function AdminDashboard(): ReactElement {
  return (
    <div className={styles.dashboard}>
      <KpiRow />
      <div className={styles.charts}>
        <ThroughputChart />
        <LatencyHistogram />
      </div>
      <div className={styles.bottom}>
        <ServiceHealth />
        <LiveEventLog />
      </div>
      <div className={styles.retained}>
        <RetainedCard title="SERVICE TOPOLOGY" className={styles.topologyCard}>
          <ServiceTopologyGraph />
        </RetainedCard>
        <RetainedCard className={styles.sessionsCard}>
          <SessionsPanel />
        </RetainedCard>
        <RetainedCard className={styles.incidentCard}>
          <IncidentControls />
        </RetainedCard>
        <RetainedCard className={styles.controlCard}>
          <AdminPanel />
        </RetainedCard>
      </div>
    </div>
  );
}

/** Shell for the four retained (non-self-headed-enough) cards: prototype-tone
 * background/border/radius, with an OPTIONAL uppercase head — omitted for
 * SessionsPanel/IncidentControls/AdminPanel, which already render their own
 * label internally (a second title here would just recreate the very
 * double-header problem this regrid closes). */
function RetainedCard({
  title,
  className,
  children,
}: RetainedCardProps): ReactElement {
  return (
    <section className={`${styles.retainedCard} ${className}`}>
      {title != null && (
        <header className={styles.retainedHead}>{title}</header>
      )}
      <div className={styles.retainedBody}>{children}</div>
    </section>
  );
}

interface RetainedCardProps {
  title?: string;
  className: string;
  children: ReactElement;
}
