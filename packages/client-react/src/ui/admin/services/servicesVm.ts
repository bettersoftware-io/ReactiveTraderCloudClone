import type { ServiceNode, ServiceStatus } from "@rtc/domain";

// Port source: packages/client-prototype/src/admin/Services/{ServiceHealth,
// ServiceRow}.tsx (visual chrome only). The prototype rows are a static
// ServiceSeed[] with a hardcoded status/up%/lv; here rows are DERIVED from the
// live useTopology() nodes, so this vm computes the presentational fields the
// prototype hardcoded: status label, health bar %, latency label, and an
// uptime string formatted from the node's live health. NO RNG — every field
// is a pure function of the node (stable across renders and re-mounts).

type ServiceStatusLabel = "ONLINE" | "DEGRADED" | "DOWN";

export interface ServiceRowVm {
  readonly name: string;
  readonly status: ServiceStatus;
  readonly statusLabel: ServiceStatusLabel;
  /** Live health 0-100 (whole number) — drives the bar's colour ramp. */
  readonly health: number;
  /** Bar width % — the node's health, not relative throughput. */
  readonly barPct: number;
  readonly latencyLabel: string;
  readonly uptimeLabel: string;
}

// The prototype only modelled ONLINE/DEGRADED (Service.status in
// client-prototype/src/admin/types.ts); "down" is a real-app extra the
// topology simulator can emit and the brief calls out explicitly.
const STATUS_LABEL: Record<ServiceStatus, ServiceStatusLabel> = {
  ok: "ONLINE",
  degraded: "DEGRADED",
  down: "DOWN",
};

/**
 * Derive one row per topology node, in the order the topology provides them
 * (no re-sorting — mirrors ServiceTopologyGraph's fixed-layout convention).
 */
export function servicesVm(
  nodes: readonly ServiceNode[],
): readonly ServiceRowVm[] {
  return nodes.map((node) => {
    const health = clampHealth(node.health);
    return {
      name: node.name,
      status: node.status,
      statusLabel: STATUS_LABEL[node.status],
      health,
      barPct: health,
      // The live topology simulator emits unrounded floats (e.g.
      // 11.660331597900071); every fixture/test uses whole numbers, so this
      // only surfaces live. Round to an integer — the `.lat` column is a
      // fixed 42px width sized for a short string like "12ms".
      latencyLabel: `${Math.round(node.latencyMs)}ms`,
      uptimeLabel: uptimeLabelFor(health, node.status),
    };
  });
}

// The node's live health as a whole percent in [0, 100] — the simulator
// already clamps its walk, so this only defends against rogue fixtures.
function clampHealth(health: number): number {
  return Math.max(0, Math.min(100, Math.round(health)));
}

// Uptime formatted from live health: ok maps health 95-100 onto the
// prototype's "99.9x%" band (99.90-99.99), degraded maps health onto a
// "9x.x%" figure (90 + health/10, e.g. health 86 → "98.6%"), and down shows
// no uptime figure (em dash, matching the "NO DATA"-style placeholders used
// elsewhere in the admin board).
function uptimeLabelFor(health: number, status: ServiceStatus): string {
  if (status === "down") return "—";

  if (status === "degraded") {
    return `${(90 + health / 10).toFixed(1)}%`;
  }

  const digit = Math.max(0, Math.min(9, Math.round(((health - 95) / 5) * 9)));
  return `99.9${digit}%`;
}
