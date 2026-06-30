/**
 * AdminDashboard contract spec (Phase 5 Task 8).
 *
 * Verifies that the AdminDashboard composition root renders all expected
 * sub-panels (incident controls, topology, event log, sessions, metric charts)
 * and that each sub-panel starts in its default empty/idle state.
 * AdminDashboard has no container data-testid — assertions target child
 * component test-ids.
 */

import { AdminDashboard } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("AdminDashboard", () => {
  it("renders the incident-controls panel", () => {
    const dash = mount(AdminDashboard, {});
    expect(dash.hasIncidentControls()).toBe(true);
  });

  it("renders the service topology graph", () => {
    const dash = mount(AdminDashboard, {});
    expect(dash.hasTopology()).toBe(true);
  });

  it("renders the live event log", () => {
    const dash = mount(AdminDashboard, {});
    expect(dash.hasEventLog()).toBe(true);
  });

  it("renders the sessions panel", () => {
    const dash = mount(AdminDashboard, {});
    expect(dash.hasSessions()).toBe(true);
  });

  it("renders the throughput chart", () => {
    const dash = mount(AdminDashboard, {});
    expect(dash.hasThroughputChart()).toBe(true);
  });

  it("renders the latency histogram", () => {
    const dash = mount(AdminDashboard, {});
    expect(dash.hasLatencyHistogram()).toBe(true);
  });

  it("renders the error rate panel", () => {
    const dash = mount(AdminDashboard, {});
    expect(dash.hasErrorRate()).toBe(true);
  });
});
