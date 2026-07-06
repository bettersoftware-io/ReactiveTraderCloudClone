import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/**
 * Page object for AdminDashboard. The dashboard has no container data-testid,
 * so assertions query for the child component test-ids that the dashboard
 * always composes (incident-controls, topology, event-log, sessions, KPI row).
 */
export class AdminDashboardPage extends MountedComponent<
  Record<string, never>
> {
  /** True when the KPI row (throughput/latency/error-rate/sessions) is present. */
  hasKpiRow(): boolean {
    return within(this.root).queryByTestId("admin-kpi-row") !== null;
  }

  /** True when the incident-controls panel is present (always in the dashboard). */
  hasIncidentControls(): boolean {
    return within(this.root).queryByTestId("admin-incident-controls") !== null;
  }

  /** True when the topology wrapper is present. */
  hasTopology(): boolean {
    return within(this.root).queryByTestId("admin-topology") !== null;
  }

  /** True when the event log wrapper is present. */
  hasEventLog(): boolean {
    return within(this.root).queryByTestId("admin-event-log") !== null;
  }

  /** True when the sessions panel is present. */
  hasSessions(): boolean {
    return within(this.root).queryByTestId("admin-sessions") !== null;
  }

  /** True when the throughput chart is present. */
  hasThroughputChart(): boolean {
    return within(this.root).queryByTestId("admin-throughput-chart") !== null;
  }

  /** True when the latency histogram is present. */
  hasLatencyHistogram(): boolean {
    return within(this.root).queryByTestId("admin-latency-histogram") !== null;
  }
}
