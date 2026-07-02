import { describe, expect, it } from "vitest";

import type { CurrencyPositionNode } from "@rtc/domain";

import { computeBubbleLayout } from "#/ui/analytics/bubbleLayout";

describe("computeBubbleLayout", () => {
  it("returns an empty array for no nodes", () => {
    expect(computeBubbleLayout([], { width: 320 })).toEqual([]);
  });

  it("keeps every circle within the horizontal bounds", () => {
    const placed = computeBubbleLayout(
      [node("EUR", 60), node("USD", 15), node("JPY", 40)],
      { width: 320 },
    );
    expect(placed).toHaveLength(3);

    for (const b of placed) {
      expect(b.x - b.radius).toBeGreaterThanOrEqual(0);
      expect(b.x + b.radius).toBeLessThanOrEqual(320);
    }
  });

  it("never overlaps two circles", () => {
    const placed = computeBubbleLayout(
      [node("EUR", 60), node("USD", 15), node("JPY", 40), node("GBP", 30)],
      { width: 320 },
    );

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        expect(dist).toBeGreaterThanOrEqual(a.radius + b.radius);
      }
    }
  });

  it("is deterministic", () => {
    const nodes = [node("EUR", 60), node("USD", 15)];
    expect(computeBubbleLayout(nodes, { width: 320 })).toEqual(
      computeBubbleLayout(nodes, { width: 320 }),
    );
  });
});

function node(currency: string, radius: number): CurrencyPositionNode {
  return {
    currency,
    radius,
    tradedAmount: radius,
    sign: "pos",
    text: currency,
  };
}
