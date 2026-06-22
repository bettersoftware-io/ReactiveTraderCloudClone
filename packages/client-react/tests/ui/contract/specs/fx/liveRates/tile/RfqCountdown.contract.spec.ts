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

  it("fills the progress bar proportionally", () => {
    const cd = mount(RfqCountdown, {
      props: { remainingMs: 5_000, totalMs: 10_000 },
    });
    expect(cd.fillWidth()).toBe("50%");
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

  it("treats a zero total as an empty bar without dividing by zero", () => {
    const cd = mount(RfqCountdown, { props: { remainingMs: 0, totalMs: 0 } });
    expect(cd.fillWidth()).toBe("0%");
    expect(cd.caption()).toBe("0s remaining");
  });

  it("shrinks the bar as the remaining time ticks down", () => {
    const cd = mount(RfqCountdown, {
      props: { remainingMs: 8_000, totalMs: 10_000 },
    });
    expect(cd.fillWidth()).toBe("80%");
    cd.setProps({ remainingMs: 3_000 });
    expect(cd.fillWidth()).toBe("30%");
    expect(cd.caption()).toBe("3s remaining");
  });
});
