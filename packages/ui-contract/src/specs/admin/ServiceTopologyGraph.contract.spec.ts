/**
 * ServiceTopologyGraph contract spec (Phase 5 Task 8).
 *
 * Verifies that the topology graph renders one node per service, that a down
 * node carries data-status="down", and that the empty placeholder renders
 * when no topology data is available.
 *
 * NOTE: Individual node <g> elements carry data-status but NOT
 * data-testid="topology-node-<name>" — the page object queries by SVG text
 * content instead (reported gap; component not modified per task constraint).
 */

import { ServiceTopologyGraph } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { ServiceTopology } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const HEALTHY_TOPOLOGY: ServiceTopology = {
  nodes: [
    {
      name: "pricing",
      status: "ok",
      health: 98,
      throughput: 120,
      latencyMs: 5,
    },
    {
      name: "execution",
      status: "ok",
      health: 98,
      throughput: 80,
      latencyMs: 3,
    },
    { name: "blotter", status: "ok", health: 98, throughput: 60, latencyMs: 4 },
    { name: "kernel", status: "ok", health: 98, throughput: 200, latencyMs: 2 },
    {
      name: "analytics",
      status: "ok",
      health: 98,
      throughput: 40,
      latencyMs: 6,
    },
    { name: "credit", status: "ok", health: 98, throughput: 30, latencyMs: 7 },
    { name: "refdata", status: "ok", health: 98, throughput: 10, latencyMs: 1 },
  ],
  edges: [
    { from: "kernel", to: "pricing", latencyMs: 3 },
    { from: "kernel", to: "execution", latencyMs: 2 },
    { from: "kernel", to: "blotter", latencyMs: 4 },
  ],
};

const TOPOLOGY_WITH_DOWN: ServiceTopology = {
  nodes: [
    {
      name: "pricing",
      status: "ok",
      health: 98,
      throughput: 100,
      latencyMs: 5,
    },
    {
      name: "execution",
      status: "down",
      health: 0,
      throughput: 0,
      latencyMs: 0,
    },
    {
      name: "blotter",
      status: "degraded",
      health: 86,
      throughput: 20,
      latencyMs: 150,
    },
    { name: "kernel", status: "ok", health: 98, throughput: 200, latencyMs: 2 },
    {
      name: "analytics",
      status: "ok",
      health: 98,
      throughput: 40,
      latencyMs: 6,
    },
    { name: "credit", status: "ok", health: 98, throughput: 30, latencyMs: 7 },
    { name: "refdata", status: "ok", health: 98, throughput: 10, latencyMs: 1 },
  ],
  edges: [
    { from: "kernel", to: "pricing", latencyMs: 3 },
    { from: "kernel", to: "blotter", latencyMs: 150 },
  ],
};

describe("ServiceTopologyGraph", () => {
  it("shows the empty placeholder when no topology data is seeded", () => {
    const graph = mount(ServiceTopologyGraph, {});
    expect(graph.isEmpty()).toBe(true);
  });

  it("renders one node per service when topology is seeded", () => {
    const graph = mount(ServiceTopologyGraph, {
      admin: { topology: HEALTHY_TOPOLOGY },
    });

    expect(graph.isEmpty()).toBe(false);

    for (const node of HEALTHY_TOPOLOGY.nodes) {
      expect(graph.hasNode(node.name)).toBe(true);
    }
  });

  it("renders all seven standard service nodes", () => {
    const graph = mount(ServiceTopologyGraph, {
      admin: { topology: HEALTHY_TOPOLOGY },
    });

    const services = [
      "pricing",
      "execution",
      "blotter",
      "analytics",
      "credit",
      "refdata",
      "kernel",
    ] as const;

    for (const name of services) {
      expect(graph.hasNode(name)).toBe(true);
    }
  });

  it("ok nodes carry data-status='ok'", () => {
    const graph = mount(ServiceTopologyGraph, {
      admin: { topology: HEALTHY_TOPOLOGY },
    });

    expect(graph.nodeStatus("pricing")).toBe("ok");
    expect(graph.nodeStatus("kernel")).toBe("ok");
  });

  it("a down node carries data-status='down'", () => {
    const graph = mount(ServiceTopologyGraph, {
      admin: { topology: TOPOLOGY_WITH_DOWN },
    });

    expect(graph.nodeStatus("execution")).toBe("down");
  });

  it("a degraded node carries data-status='degraded'", () => {
    const graph = mount(ServiceTopologyGraph, {
      admin: { topology: TOPOLOGY_WITH_DOWN },
    });

    expect(graph.nodeStatus("blotter")).toBe("degraded");
  });

  it("re-renders when the topology$ subject is updated", () => {
    const graph = mount(ServiceTopologyGraph, {});

    expect(graph.isEmpty()).toBe(true);

    graph.setTopology(HEALTHY_TOPOLOGY);

    expect(graph.isEmpty()).toBe(false);
    expect(graph.hasNode("pricing")).toBe(true);
  });
});
