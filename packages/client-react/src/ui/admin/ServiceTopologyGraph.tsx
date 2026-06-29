import type { CSSProperties, ReactElement } from "react";

import type { ServiceName } from "@rtc/domain";

import { useHooks } from "#/ui/hooks/useHooks";

import styles from "./ServiceTopologyGraph.module.css";

const VIEW_W = 300;
const VIEW_H = 200;

interface Point {
  readonly x: number;
  readonly y: number;
}

// FIXED deterministic layout keyed by ServiceName — positions never come from
// the simulation, so the graph is stable across re-renders and ports verbatim.
const LAYOUT: Readonly<Record<ServiceName, Point>> = {
  kernel: { x: 150, y: 100 },
  pricing: { x: 64, y: 52 },
  execution: { x: 236, y: 52 },
  blotter: { x: 236, y: 148 },
  analytics: { x: 64, y: 148 },
  credit: { x: 150, y: 28 },
  refdata: { x: 150, y: 172 },
};

// Node radius grows with throughput (pure fn of the live value vs the peak).
function nodeRadius(throughput: number, peak: number): number {
  const fraction = peak > 0 ? throughput / peak : 0;
  return 6 + fraction * 8;
}

// Node fill-opacity grows with throughput; quieter services fade back.
function nodeOpacity(throughput: number, peak: number): number {
  const fraction = peak > 0 ? throughput / peak : 0;
  return 0.5 + fraction * 0.5;
}

// Edge heat — stroke-opacity of the negative accent, reddening with latency.
function edgeHeat(latencyMs: number, peak: number): number {
  const fraction = peak > 0 ? latencyMs / peak : 0;
  return 0.15 + fraction * 0.75;
}

/**
 * Service-topology graph. Nodes sit at a FIXED layout keyed by ServiceName;
 * their radius/opacity are pure functions of `throughput`, edges redden with
 * `latencyMs`, and `data-status` drives a CSS pulse keyframe (no JS timer).
 */
export function ServiceTopologyGraph(): ReactElement {
  const { useTopology } = useHooks();
  const topology = useTopology();

  if (!topology) {
    return (
      <div data-testid="admin-topology" className={styles.wrapper}>
        <div className={styles.empty}>NO TOPOLOGY DATA</div>
      </div>
    );
  }

  const peakThroughput = Math.max(
    1,
    ...topology.nodes.map((n) => {
      return n.throughput;
    }),
  );
  const peakLatency = Math.max(
    1,
    ...topology.edges.map((e) => {
      return e.latencyMs;
    }),
  );

  return (
    <div data-testid="admin-topology" className={styles.wrapper}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        className={styles.svg}
        aria-label="Service topology graph"
      >
        <title>Service topology</title>
        {topology.edges.map((edge) => {
          const a = LAYOUT[edge.from];
          const b = LAYOUT[edge.to];
          return (
            <line
              key={`${edge.from}-${edge.to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={styles.edge}
              style={
                // eslint-disable-next-line no-restricted-syntax -- runtime edge heat via CSS custom property; static CSS can't express a per-edge value
                {
                  "--edge-heat": edgeHeat(edge.latencyMs, peakLatency),
                } as CSSProperties
              }
            />
          );
        })}
        {topology.nodes.map((node) => {
          const p = LAYOUT[node.name];
          return (
            <g
              key={node.name}
              className={styles.node}
              data-status={node.status}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={nodeRadius(node.throughput, peakThroughput)}
                className={styles.dot}
                style={
                  // eslint-disable-next-line no-restricted-syntax -- runtime node opacity via CSS custom property; static CSS can't express a per-node value
                  {
                    "--node-opacity": nodeOpacity(
                      node.throughput,
                      peakThroughput,
                    ),
                  } as CSSProperties
                }
              />
              <text x={p.x} y={p.y - 12} className={styles.nodeLabel}>
                {node.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
