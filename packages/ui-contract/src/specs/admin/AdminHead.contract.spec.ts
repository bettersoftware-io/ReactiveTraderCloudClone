/**
 * AdminHead contract spec (v2 Parity E Task 4).
 *
 * The admin-dashboard panel's registered head slot: a single always-active
 * "◈ Observability" head tab (shared PanelHeadTabs chrome, single view so
 * nothing toggles it) plus a status pill wired to the SAME useIncident() seam
 * IncidentControls drives (real IncidentMachine, not a fake) — nominal when
 * no incident kind is active, incident-active otherwise. Drives the shared
 * World's injectIncident()/clearIncident() directly (no buttons on this
 * component), mirroring the IncidentControls ↔ ConnectionOverlay coupling
 * spec's approach to the same seam.
 */

import { AdminHead } from "@ui-contract/components";
import { cleanupMounted, createWorld, mountWith } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("AdminHead", () => {
  it("renders the observability title as an always-active head tab", () => {
    const world = createWorld();
    const head = mountWith(world, AdminHead);
    expect(head.titleText()).toBe("◈ Observability");
    expect(head.isTitleActive()).toBe(true);
  });

  it("shows the all-clear pill when no incident is active", () => {
    const world = createWorld();
    const head = mountWith(world, AdminHead);

    expect(head.pillText()).toBe("● ALL SYSTEMS NOMINAL");
    expect(head.isIncidentActive()).toBe(false);
  });

  it("flips to the incident-active pill once an incident is injected", () => {
    const world = createWorld();
    const head = mountWith(world, AdminHead);

    head.injectIncident("serviceDown");

    expect(head.pillText()).toBe("● INCIDENT ACTIVE");
    expect(head.isIncidentActive()).toBe(true);
  });

  it("flips back to nominal once clearIncident() resets all active kinds", () => {
    const world = createWorld();
    const head = mountWith(world, AdminHead);

    head.injectIncident("latencySpike");
    expect(head.isIncidentActive()).toBe(true);

    head.clearIncident();

    expect(head.isIncidentActive()).toBe(false);
    expect(head.pillText()).toBe("● ALL SYSTEMS NOMINAL");
  });
});
