import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

/** The top-level region test-ids the dashboard composes, in the order Task 4's
 * regrid places them: KPI row, then the two charts, then health+events, then
 * the retained row (topology/sessions/incident-controls — AdminPanel has no
 * test-id of its own, checked separately via {@link hasThroughputControl}). */
const TOP_LEVEL_TESTIDS = [
  "admin-kpi-row",
  "admin-throughput-chart",
  "admin-latency-histogram",
  "admin-service-health",
  "admin-event-log",
  "admin-topology",
  "admin-sessions",
  "admin-incident-controls",
] as const;

/**
 * Page object for AdminDashboard. The dashboard has no container data-testid,
 * so assertions query for the child component test-ids that the dashboard
 * always composes (incident-controls, topology, event-log, sessions, KPI row).
 */
export class AdminDashboardPage extends MountedComponent<
  Record<string, never>
> {
  /** The dashboard's top-level region test-ids in DOM order (restricted to the
   * known set — nested test-ids like admin-kpi-tput or incident-clear are
   * excluded so a child's internal structure can't corrupt the region order). */
  regionOrder(): string[] {
    const known = new Set<string>(TOP_LEVEL_TESTIDS);
    return Array.from(this.root.querySelectorAll<HTMLElement>("[data-testid]"))
      .map((el) => {
        return el.getAttribute("data-testid") ?? "";
      })
      .filter((id) => {
        return known.has(id);
      });
  }

  /** True when the throughput-control card (AdminPanel, no test-id of its own —
   * located by its "Throughput Control" heading) is present. */
  hasThroughputControl(): boolean {
    return (
      within(this.root).queryByRole("heading", {
        name: /throughput control/i,
      }) !== null
    );
  }

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

  /** True when the service-health list is present. */
  hasServiceHealth(): boolean {
    return within(this.root).queryByTestId("admin-service-health") !== null;
  }
}
