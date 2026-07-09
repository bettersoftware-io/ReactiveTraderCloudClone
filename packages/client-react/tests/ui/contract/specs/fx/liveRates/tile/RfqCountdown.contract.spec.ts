import { RfqCountdown } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

describe("RfqCountdown", () => {
  it("shows the rounded-up seconds remaining", () => {
    const cd = mount(RfqCountdown, {
      props: { remainingMs: 7_200, totalMs: 10_000 },
    });
    expect(cd.caption()).toBe("8s remaining");
  });

  it("drains via one mount-time animation, fast-forwarded to the elapsed time", () => {
    const cd = mount(RfqCountdown, {
      props: { remainingMs: 5_000, totalMs: 10_000 },
    });
    expect(cd.fillDuration()).toBe("10000ms");
    expect(cd.fillDelay()).toBe("-5000ms");
  });

  it("uses the primary colour while plenty of time remains", () => {
    const cd = mount(RfqCountdown, {
      props: { remainingMs: 5_000, totalMs: 10_000 },
    });
    expect(cd.fillColor()).toBe("var(--accent-primary)");
  });

  it("switches to the warning colour below 30% remaining", () => {
    const cd = mount(RfqCountdown, {
      props: { remainingMs: 2_000, totalMs: 10_000 },
    });
    expect(cd.fillColor()).toBe("var(--accent-aware)");
  });

  it("treats a zero total as an instantly-finished bar without dividing by zero", () => {
    const cd = mount(RfqCountdown, { props: { remainingMs: 0, totalMs: 0 } });
    expect(cd.fillDuration()).toBe("0ms");
    expect(cd.fillDelay()).toBe("0ms");
    expect(cd.caption()).toBe("0s remaining");
  });

  it("keeps the mount-frozen animation timing while the caption ticks down", () => {
    const cd = mount(RfqCountdown, {
      props: { remainingMs: 8_000, totalMs: 10_000 },
    });
    expect(cd.fillDuration()).toBe("10000ms");
    expect(cd.fillDelay()).toBe("-2000ms");
    cd.setProps({ remainingMs: 3_000 });
    // Progression is owned by the CSS animation — re-renders only refresh
    // the caption (and the warn colour below), never the animation timing.
    expect(cd.fillDuration()).toBe("10000ms");
    expect(cd.fillDelay()).toBe("-2000ms");
    expect(cd.caption()).toBe("3s remaining");
  });
});
