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

test("admin/kpi-row", async ({ mount }) => {
  // KpiRow isolated: the "loaded" baseline arm — all four cards warn=false.
  const c = await mount(<VisualScenario name="admin/kpi-row" />);
  await expect(c.getByTestId("admin-kpi-row")).toBeVisible();
  await expect(c).toHaveScreenshot("kpi-row.png", {
    animations: "disabled",
  });
});

test("admin/kpi-row-warn", async ({ mount }) => {
  // KpiRow warn arm: latency + error-rate cross their warn thresholds
  // (lat>60, err>0.8) → the accent-negative value/delta colour on those cards.
  const c = await mount(<VisualScenario name="admin/kpi-row-warn" />);
  await expect(
    c.getByTestId("admin-kpi-lat").locator("span[data-kpi='lat']"),
  ).toHaveAttribute("data-warn", "true");
  await expect(c).toHaveScreenshot("kpi-row-warn.png", {
    animations: "disabled",
  });
});

test("admin/service-health", async ({ mount }) => {
  // ServiceHealth isolated: mixed status arms (ok/degraded/down) in one
  // topology snapshot — "down" is a real-app extra with no PROTO equivalent.
  const c = await mount(<VisualScenario name="admin/service-health" />);
  await expect(c.getByTestId("admin-service-health")).toBeVisible();
  await expect(c).toHaveScreenshot("service-health.png", {
    animations: "disabled",
  });
});

test("admin/head-nominal", async ({ mount }) => {
  // AdminHead isolated: no incident active → "ALL SYSTEMS NOMINAL" pill.
  const c = await mount(<VisualScenario name="admin/head-nominal" />);
  await expect(c.getByTestId("admin-status-pill")).toHaveAttribute(
    "data-incident",
    "false",
  );
  await expect(c).toHaveScreenshot("head-nominal.png", {
    animations: "disabled",
  });
});

test("admin/head-incident", async ({ mount }) => {
  // AdminHead isolated: serviceDown incident active → "INCIDENT ACTIVE" pill —
  // the same real useIncident() seam IncidentControls drives.
  const c = await mount(<VisualScenario name="admin/head-incident" />);
  await expect(c.getByTestId("admin-status-pill")).toHaveAttribute(
    "data-incident",
    "true",
  );
  await expect(c).toHaveScreenshot("head-incident.png", {
    animations: "disabled",
  });
});
