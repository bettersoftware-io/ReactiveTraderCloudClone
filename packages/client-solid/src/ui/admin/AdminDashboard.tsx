import type { JSX } from "solid-js";
import { Show } from "solid-js";

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
export function AdminDashboard(): JSX.Element {
  return (
    <div class={styles.dashboard}>
      <KpiRow />
      <div class={styles.charts}>
        <ThroughputChart />
        <LatencyHistogram />
      </div>
      <div class={styles.bottom}>
        <ServiceHealth />
        <LiveEventLog />
      </div>
      <div class={styles.retained}>
        <RetainedCard title="SERVICE TOPOLOGY" class={styles.topologyCard}>
          <ServiceTopologyGraph />
        </RetainedCard>
        <RetainedCard class={styles.sessionsCard}>
          <SessionsPanel />
        </RetainedCard>
        <RetainedCard class={styles.incidentCard}>
          <IncidentControls />
        </RetainedCard>
        <RetainedCard class={styles.controlCard}>
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
function RetainedCard(props: RetainedCardProps): JSX.Element {
  return (
    <section class={`${styles.retainedCard} ${props.class}`}>
      <Show when={props.title != null}>
        <header class={styles.retainedHead}>{props.title}</header>
      </Show>
      <div class={styles.retainedBody}>{props.children}</div>
    </section>
  );
}

interface RetainedCardProps {
  title?: string;
  class: string;
  children: JSX.Element;
}
