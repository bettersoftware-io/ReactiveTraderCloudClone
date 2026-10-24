/**
 * OpsDashboard contract spec (Phase 5 Task 8).
 *
 * Verifies that the OpsDashboard composition root renders all expected
 * sub-panels (incident controls, topology, event log, sessions, metric charts)
 * and that each sub-panel starts in its default empty/idle state.
 * OpsDashboard has no container data-testid — assertions target child
 * component test-ids.
 */

import { OpsDashboard } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("OpsDashboard", () => {
  it("renders the KPI row", () => {
    const dash = mount(OpsDashboard, {});
    expect(dash.hasKpiRow()).toBe(true);
  });

  it("renders the incident-controls panel", () => {
    const dash = mount(OpsDashboard, {});
    expect(dash.hasIncidentControls()).toBe(true);
  });

  it("renders the service topology graph", () => {
    const dash = mount(OpsDashboard, {});
    expect(dash.hasTopology()).toBe(true);
  });

  it("renders the live event log", () => {
    const dash = mount(OpsDashboard, {});
    expect(dash.hasEventLog()).toBe(true);
  });

  it("renders the sessions panel", () => {
    const dash = mount(OpsDashboard, {});
    expect(dash.hasSessions()).toBe(true);
  });

  it("renders the throughput chart", () => {
    const dash = mount(OpsDashboard, {});
    expect(dash.hasThroughputChart()).toBe(true);
  });

  it("renders the latency histogram", () => {
    const dash = mount(OpsDashboard, {});
    expect(dash.hasLatencyHistogram()).toBe(true);
  });

  it("renders the service-health list", () => {
    const dash = mount(OpsDashboard, {});
    expect(dash.hasServiceHealth()).toBe(true);
  });

  it("renders the throughput-control card (OpsPanel) in the retained row", () => {
    const dash = mount(OpsDashboard, {});
    expect(dash.hasThroughputControl()).toBe(true);
  });

  it("renders regions top-to-bottom: KPIs, charts, health+events, then the retained row", () => {
    const dash = mount(OpsDashboard, {});
    expect(dash.regionOrder()).toEqual([
      "ops-kpi-row",
      "ops-throughput-chart",
      "ops-latency-histogram",
      "ops-service-health",
      "ops-event-log",
      "ops-topology",
      "ops-sessions",
      "ops-incident-controls",
    ]);
  });
});
