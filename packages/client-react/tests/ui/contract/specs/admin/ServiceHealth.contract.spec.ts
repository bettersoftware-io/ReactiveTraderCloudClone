/**
 * ServiceHealth contract spec (v2 Parity E Task 3).
 *
 * Verifies that ServiceHealth derives one row per useTopology() node (status
 * dot, utilisation bar, latency, uptime), including the real-app "down"
 * status the client-prototype source never modelled (it only had
 * ONLINE/DEGRADED), and that it shows a placeholder when no topology data has
 * arrived yet.
 */

import { ServiceHealth } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { ServiceTopology } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const HEALTHY_TOPOLOGY: ServiceTopology = {
  nodes: [
    { name: "kernel", status: "ok", throughput: 200, latencyMs: 2 },
    { name: "pricing", status: "ok", throughput: 100, latencyMs: 5 },
  ],
  edges: [],
};

const MIXED_TOPOLOGY: ServiceTopology = {
  nodes: [
    { name: "kernel", status: "ok", throughput: 200, latencyMs: 2 },
    { name: "blotter", status: "degraded", throughput: 20, latencyMs: 150 },
    { name: "execution", status: "down", throughput: 0, latencyMs: 0 },
  ],
  edges: [],
};

describe("ServiceHealth", () => {
  it("shows the empty placeholder when no topology data is seeded", () => {
    const health = mount(ServiceHealth, {});
    expect(health.isEmpty()).toBe(true);
    expect(health.rowCount()).toBe(0);
  });

  it("renders one row per topology node", () => {
    const health = mount(ServiceHealth, {
      admin: { topology: HEALTHY_TOPOLOGY },
    });

    expect(health.isEmpty()).toBe(false);
    expect(health.rowCount()).toBe(2);
    expect(health.hasService("kernel")).toBe(true);
    expect(health.hasService("pricing")).toBe(true);
  });

  it("maps ok -> data-status='ok' (rendered ONLINE)", () => {
    const health = mount(ServiceHealth, {
      admin: { topology: HEALTHY_TOPOLOGY },
    });
    expect(health.statusFor("kernel")).toBe("ok");
  });

  it("maps degraded -> data-status='degraded'", () => {
    const health = mount(ServiceHealth, {
      admin: { topology: MIXED_TOPOLOGY },
    });
    expect(health.statusFor("blotter")).toBe("degraded");
  });

  it("maps down -> data-status='down' (the real-app extra status)", () => {
    const health = mount(ServiceHealth, {
      admin: { topology: MIXED_TOPOLOGY },
    });
    expect(health.statusFor("execution")).toBe("down");
  });

  it("renders latency as '<ms>ms'", () => {
    const health = mount(ServiceHealth, {
      admin: { topology: HEALTHY_TOPOLOGY },
    });
    expect(health.latencyFor("pricing")).toBe("5ms");
  });

  it("gives the busiest node a 100% utilisation bar", () => {
    const health = mount(ServiceHealth, {
      admin: { topology: HEALTHY_TOPOLOGY },
    });
    expect(health.barPctFor("kernel")).toBe("100%");
    expect(health.barPctFor("pricing")).toBe("50%");
  });

  it("renders a deterministic uptime for ok/degraded rows and an em dash for down", () => {
    const health = mount(ServiceHealth, {
      admin: { topology: MIXED_TOPOLOGY },
    });
    expect(health.uptimeFor("kernel")).toBe("99.91%");
    expect(health.uptimeFor("blotter")).toBe("98.4%");
    expect(health.uptimeFor("execution")).toBe("—");
  });

  it("re-renders when the topology$ subject is updated", () => {
    const health = mount(ServiceHealth, {});

    expect(health.isEmpty()).toBe(true);

    health.setTopology(HEALTHY_TOPOLOGY);

    expect(health.isEmpty()).toBe(false);
    expect(health.hasService("kernel")).toBe(true);
  });
});
