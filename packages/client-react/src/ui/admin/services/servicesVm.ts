import type { ServiceNode, ServiceStatus } from "@rtc/domain";

// Port source: packages/client-prototype/src/admin/Services/{ServiceHealth,
// ServiceRow}.tsx (visual chrome only). The prototype rows are a static
// ServiceSeed[] with a hardcoded status/up%/lv; here rows are DERIVED from the
// live useTopology() nodes, so this vm computes the presentational fields the
// prototype hardcoded: status label, utilisation bar %, latency label, and a
// deterministic uptime string. NO RNG — uptime varies only by service name
// (stable across renders and re-mounts).

type ServiceStatusLabel = "ONLINE" | "DEGRADED" | "DOWN";

export interface ServiceRowVm {
  readonly name: string;
  readonly status: ServiceStatus;
  readonly statusLabel: ServiceStatusLabel;
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
  const maxThroughput = Math.max(
    0,
    ...nodes.map((node) => {
      return node.throughput;
    }),
  );

  return nodes.map((node) => {
    return {
      name: node.name,
      status: node.status,
      statusLabel: STATUS_LABEL[node.status],
      barPct: barPctFor(node.throughput, maxThroughput),
      latencyLabel: `${node.latencyMs}ms`,
      uptimeLabel: uptimeLabelFor(node.name, node.status),
    };
  });
}

// Utilisation bar % — throughput relative to the busiest node in the same
// topology snapshot, clamped to [0, 100] and rounded to a whole percent. A
// topology with every node idle (max 0) renders every bar at 0, not NaN.
function barPctFor(throughput: number, maxThroughput: number): number {
  if (maxThroughput <= 0) return 0;

  const pct = (throughput / maxThroughput) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

// Deterministic 0-9 digit derived from the service name's char codes — pins a
// stable per-service uptime variance without any RNG (no Math.random, no
// simulator seed involved: two nodes named "pricing" always land on the
// same digit).
function nameDigit(name: string): number {
  let hash = 0;

  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 100;
  }

  return hash % 10;
}

// ok -> 99.9x (x = per-name digit, so 99.90-99.99); degraded -> 98.x (98.0-
// 98.9); down -> no uptime figure (em dash, matching the "NO DATA"-style
// placeholders used elsewhere in the admin board).
function uptimeLabelFor(name: string, status: ServiceStatus): string {
  if (status === "down") return "—";

  const digit = nameDigit(name);
  return status === "degraded" ? `98.${digit}%` : `99.9${digit}%`;
}
