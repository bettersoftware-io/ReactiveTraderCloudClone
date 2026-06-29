/**
 * IncidentControls ↔ ConnectionOverlay coupling spec (Phase 5 Task 8).
 *
 * Proves that injecting an incident through the IncidentControls seam drives
 * the ConnectionOverlay in the SAME World — the contract-tier mirror of the
 * real IncidentMachine → connection-status transition. Both components are
 * mounted under ONE shared World via mountWith(), so changes pushed by
 * injectIncident() are immediately visible to both components.
 *
 * TDD evidence:
 *  RED:  hooksFromWorld stubs returned empty/no-op — overlay stayed hidden.
 *  GREEN: World-backed useIncident + injectIncident pushes DISCONNECTED →
 *          ConnectionOverlay re-renders visible.
 */

import { ConnectionOverlay, IncidentControls } from "@ui-contract/components";
import { cleanupMounted, createWorld, mountWith } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("IncidentControls ↔ ConnectionOverlay coupling", () => {
  it("overlay is hidden before any incident is injected", () => {
    const world = createWorld();
    const _controls = mountWith(world, IncidentControls);
    const overlay = mountWith(world, ConnectionOverlay);

    expect(overlay.isVisible()).toBe(false);
  });

  it("injecting serviceDown disconnects, surfacing the ConnectionOverlay", async () => {
    const world = createWorld();
    const controls = mountWith(world, IncidentControls);
    const overlay = mountWith(world, ConnectionOverlay);

    expect(overlay.isVisible()).toBe(false);

    controls.inject("serviceDown");
    await overlay.waitUntilVisible();

    expect(overlay.isVisible()).toBe(true);
    expect(overlay.message()).toMatch(/re-connect to the server/i);
  });

  it("injecting latencySpike disconnects, surfacing the ConnectionOverlay", async () => {
    const world = createWorld();
    const controls = mountWith(world, IncidentControls);
    const overlay = mountWith(world, ConnectionOverlay);

    controls.inject("latencySpike");
    await overlay.waitUntilVisible();

    expect(overlay.isVisible()).toBe(true);
    expect(overlay.message()).toMatch(/re-connect to the server/i);
  });

  it("injecting errorBurst does NOT disconnect (overlay stays hidden)", async () => {
    const world = createWorld();
    const controls = mountWith(world, IncidentControls);
    const overlay = mountWith(world, ConnectionOverlay);

    controls.inject("errorBurst");

    // Give React a tick to flush any potential re-render.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(overlay.isVisible()).toBe(false);
  });

  it("clear after serviceDown reconnects, hiding the overlay", async () => {
    const world = createWorld();
    const controls = mountWith(world, IncidentControls);
    const overlay = mountWith(world, ConnectionOverlay);

    controls.inject("serviceDown");
    await overlay.waitUntilVisible();

    controls.clear();
    await overlay.waitUntilHidden();

    expect(overlay.isVisible()).toBe(false);
  });

  it("IncidentControls marks the active incident button with data-active=true", () => {
    const world = createWorld();
    const controls = mountWith(world, IncidentControls);
    mountWith(world, ConnectionOverlay);

    expect(controls.isActive("serviceDown")).toBe(false);
    controls.inject("serviceDown");
    expect(controls.isActive("serviceDown")).toBe(true);
  });

  it("clear resets all active incident buttons", () => {
    const world = createWorld();
    const controls = mountWith(world, IncidentControls);
    mountWith(world, ConnectionOverlay);

    controls.inject("serviceDown");
    expect(controls.isActive("serviceDown")).toBe(true);

    controls.clear();
    expect(controls.isActive("serviceDown")).toBe(false);
    expect(controls.isIdle()).toBe(true);
  });

  it("overlay 'Clear incident' button recovers from a serviceDown incident", async () => {
    const world = createWorld();
    const controls = mountWith(world, IncidentControls);
    const overlay = mountWith(world, ConnectionOverlay);

    // Inject serviceDown → overlay must appear with the clear button visible
    controls.inject("serviceDown");
    await overlay.waitUntilVisible();
    expect(overlay.clearIncidentButton()).not.toBeNull();

    // Click the overlay's own clear button → overlay must hide
    overlay.clearIncident();
    await overlay.waitUntilHidden();

    expect(overlay.isVisible()).toBe(false);
  });

  it("errorBurst marks the button active but leaves other buttons inactive", () => {
    const world = createWorld();
    const controls = mountWith(world, IncidentControls);
    mountWith(world, ConnectionOverlay);

    controls.inject("errorBurst");
    expect(controls.isActive("errorBurst")).toBe(true);
    expect(controls.isActive("serviceDown")).toBe(false);
    expect(controls.isActive("latencySpike")).toBe(false);
  });
});
