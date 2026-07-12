import { PnlSparkline } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("PnlSparkline", () => {
  it("paints a positive bar with the positive accent (shared scale)", () => {
    const spark = mount(PnlSparkline, {
      props: { pnl: 750, maxAbsPnl: 1000 },
    });

    expect(spark.hasSvg()).toBe(true);
    expect(spark.barFill()).toBe("var(--accent-positive)");
  });

  it("paints a negative bar with the negative accent (shared scale)", () => {
    const spark = mount(PnlSparkline, {
      props: { pnl: -750, maxAbsPnl: 1000 },
    });

    expect(spark.barFill()).toBe("var(--accent-negative)");
  });

  it("falls back to its own magnitude as the scale when maxAbsPnl is omitted", () => {
    const spark = mount(PnlSparkline, { props: { pnl: 250 } });

    expect(spark.hasSvg()).toBe(true);
    expect(spark.barFill()).toBe("var(--accent-positive)");
  });

  it("renders a degenerate zero bar without a divide-by-zero scale", () => {
    const spark = mount(PnlSparkline, { props: { pnl: 0 } });

    expect(spark.hasSvg()).toBe(true);
    expect(spark.barFill()).toBe("var(--accent-positive)");
  });
});
