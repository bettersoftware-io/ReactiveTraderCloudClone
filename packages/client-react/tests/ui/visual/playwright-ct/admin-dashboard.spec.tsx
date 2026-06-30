import { expect, test } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("admin/dashboard", async ({ mount }) => {
  // Full AdminDashboard at 1280×700: all telemetry cards (METRICS, THROUGHPUT,
  // LATENCY, ERRORS, SERVICE TOPOLOGY, EVENT LOG, SESSIONS, INCIDENT CONTROLS,
  // THROUGHPUT CONTROL) rendered from seeded admin-loaded fixture data.
  const c = await mount(<VisualScenario name="admin/dashboard" />);
  await expect(c.getByTestId("admin-incident-controls")).toBeVisible();
  await expect(c).toHaveScreenshot("dashboard.png", {
    animations: "disabled",
  });
});

test("admin/topology", async ({ mount }) => {
  // ServiceTopologyGraph isolated: seeded nodes (kernel, pricing, execution,
  // blotter, analytics, credit, refdata) + edges with a degraded credit node.
  // Fixed 300×200 wrapper stabilises the SVG viewBox fill.
  const c = await mount(<VisualScenario name="admin/topology" />);
  await expect(c.getByTestId("admin-topology")).toBeVisible();
  await expect(c).toHaveScreenshot("topology.png", {
    animations: "disabled",
  });
});

test("admin/event-log", async ({ mount }) => {
  // LiveEventLog isolated: seeded events covering info/warn/error severity arms.
  // Fixed 400px width prevents font-mono glyph-advance variance from flaking.
  const c = await mount(<VisualScenario name="admin/event-log" />);
  await expect(c.getByTestId("admin-event-log")).toBeVisible();
  await expect(c).toHaveScreenshot("event-log.png", {
    animations: "disabled",
  });
});

test("admin/incident-active", async ({ mount }) => {
  // IncidentControls with serviceDown active: "Inject service down" button has
  // data-active="true"; state is injected through the seam — no click needed.
  const c = await mount(<VisualScenario name="admin/incident-active" />);
  await expect(c.getByTestId("admin-incident-controls")).toBeVisible();
  await expect(c).toHaveScreenshot("incident-active.png", {
    animations: "disabled",
  });
});
