import { RfqFilterPills } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { CreditRfqFilter } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

describe("RfqFilterPills", () => {
  it("shows the LIVE count and highlights the active pill", () => {
    const pills = mount(RfqFilterPills, {
      props: { filter: "live", liveCount: 3, onFilter: () => {} },
    });
    expect(pills.text("live")).toBe("LIVE 3");
    expect(pills.text("closed")).toBe("CLOSED");
    expect(pills.text("all")).toBe("ALL");
    expect(pills.isActive("live")).toBe(true);
    expect(pills.isActive("closed")).toBe(false);
    expect(pills.isActive("all")).toBe(false);
  });

  it("highlights whichever filter prop is active", () => {
    const pills = mount(RfqFilterPills, {
      props: { filter: "all", liveCount: 0, onFilter: () => {} },
    });
    expect(pills.isActive("all")).toBe(true);
    expect(pills.isActive("live")).toBe(false);
  });

  it("fires onFilter with the clicked filter", async () => {
    const picks: CreditRfqFilter[] = [];
    const pills = mount(RfqFilterPills, {
      props: {
        filter: "live",
        liveCount: 1,
        onFilter: (f: CreditRfqFilter) => {
          return picks.push(f);
        },
      },
    });
    await pills.click("closed");
    await pills.click("all");
    await pills.click("live");
    expect(picks).toEqual(["closed", "all", "live"]);
  });

  it("moves the highlight when the filter prop changes", () => {
    const pills = mount(RfqFilterPills, {
      props: { filter: "live", liveCount: 2, onFilter: () => {} },
    });
    expect(pills.isActive("live")).toBe(true);
    pills.setProps({ filter: "closed" });
    expect(pills.isActive("closed")).toBe(true);
    expect(pills.isActive("live")).toBe(false);
  });
});
