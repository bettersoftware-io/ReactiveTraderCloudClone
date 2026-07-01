import { drag } from "d3-drag";
import {
  forceCollide,
  forceSimulation,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from "d3-force";
import { select } from "d3-selection";
import type { ReactElement } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";

import {
  aggregatePositionsByCurrency,
  type CurrencyPairPosition,
} from "@rtc/domain";

import styles from "./PositionBubbles.module.css";

export function PositionBubbles({
  positions,
}: PositionBubblesProps): ReactElement {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // Keep the latest aggregation in a ref so the d3 effect (mounted once) can
  // read fresh data without re-running and tearing down the simulation.
  const nodes = aggregatePositionsByCurrency(positions).map((n) => {
    return {
      id: n.currency,
      r: n.radius,
      sign: n.sign,
      text: n.text,
    };
  });
  const nodesRef = useRef<BubbleNode[]>(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  });

  useLayoutEffect(() => {
    const chartDiv = wrapperRef.current;
    if (!chartDiv) return;

    // In jsdom, getBoundingClientRect returns 0/0; use a fallback so bubbles
    // still render at a nominal centre point for contract tests.
    const rect = chartDiv.getBoundingClientRect();
    const width = rect.width || 600;
    const height = rect.height || 180;

    const tooltip = select(chartDiv)
      .append("div")
      .attr("class", styles.tooltip)
      .attr("data-testid", "tooltip")
      .style("visibility", "hidden");

    const svg = select(chartDiv)
      .append("svg")
      .attr("width", width)
      .attr("height", height);

    interface DragEvent {
      x: number;
      y: number;
      sourceEvent: MouseEvent;
    }

    function positionTooltip(event: MouseEvent | null, node: BubbleNode): void {
      if (node.x === undefined || node.y === undefined) return;
      const tipWidth =
        (tooltip.node() as HTMLDivElement | null)?.clientWidth ?? 0;
      const posX = (event ? event.offsetX : node.x) - tipWidth / 2;
      const posY = event ? event.offsetY : node.y;
      tooltip
        .style("top", `${posY + 15}px`)
        .style("left", `${posX}px`)
        .text(`${node.id} ${node.text}`); // "{CURRENCY} {amount}"
    }

    function onMove(event: DragEvent, d: BubbleNode): void {
      force.alpha(0.5).restart();
      positionTooltip(event.sourceEvent, d);
      d.fx = event.x;
      d.fy = event.y;
    }

    /** Renders the current simulation state into the SVG. Called on each tick
     *  and once synchronously after startup so jsdom sees elements immediately. */
    function renderTick(): void {
      svg
        .selectAll<SVGGElement, BubbleNode>("g:not(.exit)")
        .data(force.nodes(), (d) => {
          return d.id;
        })
        .join(
          (enter) => {
            const g = enter
              .append("g")
              .attr("class", "node")
              .attr("data-sign", (d) => {
                return d.sign;
              })
              .style("visibility", "hidden")
              .call(
                drag<SVGGElement, BubbleNode>()
                  .on("start", onMove)
                  .on("drag", onMove)
                  .on("end", (event, d) => {
                    force.alphaTarget(0);
                    positionTooltip(event.sourceEvent, d);
                    d.fx = null; // drift back to centre
                    d.fy = null;
                  }),
              )
              .on("mouseover", (e: MouseEvent, d) => {
                tooltip.style("visibility", "visible");
                positionTooltip(e, d);
              })
              .on("mousemove", (e: MouseEvent, d) => {
                positionTooltip(e, d);
              })
              .on("mouseout", () => {
                tooltip.style("visibility", "hidden");
              });
            g.append("circle")
              .attr("r", (d) => {
                return d.r;
              })
              .attr("cx", width / 2)
              .attr("cy", height / 2);
            g.append("text")
              .attr("text-anchor", "middle")
              .attr("class", styles.label)
              .attr("data-testid", (d) => {
                return `positions-label-${d.id}`;
              })
              .text((d) => {
                return d.id;
              });
            return g;
          },
          (update) => {
            update.style("visibility", "visible");
            update
              .select("circle")
              .attr("cx", (d) => {
                return d.x ?? width / 2;
              })
              .attr("cy", (d) => {
                return d.y ?? height / 2;
              })
              .attr("r", (d) => {
                return d.r;
              });
            update
              .select("text")
              .attr("x", (d) => {
                return d.x ?? width / 2;
              })
              .attr("y", (d) => {
                return (d.y ?? height / 2) + 4;
              });
            return update;
          },
          (exit) => {
            return exit.classed("exit", true).remove();
          },
        );
    }

    const force = forceSimulation<BubbleNode>()
      .force(
        "forceX",
        forceX<BubbleNode>()
          .strength(0.1)
          .x(width * 0.5),
      )
      .force(
        "forceY",
        forceY<BubbleNode>()
          .strength(0.1)
          .y(height * 0.5),
      )
      .force(
        "collide",
        forceCollide<BubbleNode>()
          .strength(0.5)
          .radius((d) => {
            return d.r + COLLIDE_BORDER_WIDTH;
          }),
      )
      .alphaMin(0.05);

    force.on("tick", renderTick);

    force.nodes(nodesRef.current).alpha(0.5).restart();
    // Tick once synchronously so jsdom/contract-tier sees the <g> nodes
    // immediately, without waiting for d3-timer's internal tick scheduling
    // (which won't fire before the test assertion in jsdom).
    force.tick();
    renderTick();

    return () => {
      force.stop();
      select(chartDiv).select("svg").remove();
      select(chartDiv).select(`.${styles.tooltip}`).remove();
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      data-testid="position-bubbles"
      className={styles.container}
    />
  );
}

interface PositionBubblesProps {
  positions: readonly CurrencyPairPosition[];
}

// Mirrors original BubbleChart.tsx:20 — collision padding beyond each radius.
const COLLIDE_BORDER_WIDTH = 2;

interface BubbleNode extends SimulationNodeDatum {
  id: string; // currency code
  r: number;
  sign: "pos" | "neg";
  text: string; // tooltip amount, formatAsWholeNumber
}
