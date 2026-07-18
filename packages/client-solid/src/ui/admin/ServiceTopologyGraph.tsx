import type { Accessor, JSX } from "solid-js";
import { createMemo, For, Show } from "solid-js";

import type {
  ServiceEdge,
  ServiceName,
  ServiceNode,
  ServiceTopology,
} from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./ServiceTopologyGraph.module.css";

/**
 * Service-topology graph. Nodes sit at a FIXED layout keyed by ServiceName;
 * their radius/opacity are pure functions of `throughput`, edges redden with
 * `latencyMs`, and `data-status` drives a CSS pulse keyframe (no JS timer).
 * Edges + labels render as SVG; the dots are HTML overlays on a 3:2 stage so
 * the pulse composites (SVG child transforms never do — docs/performance.md).
 */
export function ServiceTopologyGraph(): JSX.Element {
  const { useTopology } = useViewModel();
  const topology = useTopology();

  return (
    <div data-testid="admin-topology" class={styles.wrapper}>
      <Show
        when={topology()}
        fallback={<div class={styles.empty}>NO TOPOLOGY DATA</div>}
      >
        {(current: Accessor<ServiceTopology>) => {
          const peakThroughput = createMemo((): number => {
            return Math.max(
              1,
              ...current().nodes.map((n) => {
                return n.throughput;
              }),
            );
          });

          const peakLatency = createMemo((): number => {
            return Math.max(
              1,
              ...current().edges.map((e) => {
                return e.latencyMs;
              }),
            );
          });

          return (
            <div class={styles.stage}>
              <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                preserveAspectRatio="xMidYMid meet"
                class={styles.svg}
                aria-label="Service topology graph"
              >
                <title>Service topology</title>
                <For each={current().edges}>
                  {(edge: ServiceEdge) => {
                    const a = LAYOUT[edge.from];
                    const b = LAYOUT[edge.to];
                    return (
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        class={styles.edge}
                        // eslint-disable-next-line no-restricted-syntax -- runtime edge heat via CSS custom property; static CSS can't express a per-edge value
                        style={{
                          "--edge-heat": edgeHeat(
                            edge.latencyMs,
                            peakLatency(),
                          ),
                        }}
                      />
                    );
                  }}
                </For>
                <For each={current().nodes}>
                  {(node: ServiceNode) => {
                    const p = LAYOUT[node.name];
                    return (
                      <g data-status={node.status}>
                        <text x={p.x} y={p.y - 12} class={styles.nodeLabel}>
                          {node.name}
                        </text>
                      </g>
                    );
                  }}
                </For>
              </svg>
              {/* Node dots live OUTSIDE the svg: the status pulse animates
                  scale, and SVG child transforms never composite
                  (docs/performance.md T3). As HTML spans the pulse runs
                  entirely on the compositor. */}
              <For each={current().nodes}>
                {(node: ServiceNode) => {
                  const p = LAYOUT[node.name];
                  return (
                    <span
                      class={styles.nodeDot}
                      data-status={node.status}
                      // eslint-disable-next-line no-restricted-syntax -- runtime node geometry + opacity via CSS custom properties; static CSS can't express per-node values
                      style={{
                        "--dot-x": `${(p.x / VIEW_W) * 100}%`,
                        "--dot-y": `${(p.y / VIEW_H) * 100}%`,
                        "--dot-r": String(
                          nodeRadius(node.throughput, peakThroughput()),
                        ),
                        "--node-opacity": nodeOpacity(
                          node.throughput,
                          peakThroughput(),
                        ),
                      }}
                    >
                      <span class={styles.nodeDotFill} />
                    </span>
                  );
                }}
              </For>
            </div>
          );
        }}
      </Show>
    </div>
  );
}

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
