import type { CurrencyPositionNode } from "@rtc/domain";

const GAP = 8;

export interface PositionedBubble extends CurrencyPositionNode {
  readonly x: number;
  readonly y: number;
}

export interface BubbleViewport {
  readonly width: number;
}

/**
 * Deterministic shelf packing: largest bubble first, laid left-to-right,
 * wrapping to a new row when the next circle would exceed `width`. Rows are
 * separated by the tallest diameter in the row, so no two circles can overlap
 * (horizontal advance >= sum of radii within a row; vertical gap >= sum of
 * radii across rows). Pure and framework-free — the RN replacement for the
 * web's d3-force layout, which encoded no information beyond the radius.
 */
export function computeBubbleLayout(
  nodes: readonly CurrencyPositionNode[],
  viewport: BubbleViewport,
): readonly PositionedBubble[] {
  const ordered = [...nodes].sort((a, b) => {
    if (b.radius !== a.radius) {
      return b.radius - a.radius;
    }

    return a.currency.localeCompare(b.currency);
  });

  const placed: PositionedBubble[] = [];
  let x = 0;
  let rowTop = 0;
  let rowMaxDiameter = 0;

  for (const node of ordered) {
    const diameter = node.radius * 2;

    if (x > 0 && x + diameter > viewport.width) {
      rowTop += rowMaxDiameter + GAP;
      x = 0;
      rowMaxDiameter = 0;
    }

    placed.push({ ...node, x: x + node.radius, y: rowTop + node.radius });
    x += diameter + GAP;
    rowMaxDiameter = Math.max(rowMaxDiameter, diameter);
  }

  return placed;
}

/** Total height needed to draw a laid-out set of bubbles. */
export function bubblesHeight(placed: readonly PositionedBubble[]): number {
  return placed.reduce((max, b) => {
    return Math.max(max, b.y + b.radius);
  }, 0);
}
