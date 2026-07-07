import { TimeframePills } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("TimeframePills", () => {
  it("renders the four timeframes with the current one active", () => {
    const pills = mount(TimeframePills, {
      props: { tf: "1W", onSet: () => {} },
    });

    expect(pills.pills()).toEqual(["1D", "1W", "1M", "3M"]);
    expect(pills.activeTf()).toBe("1W");
  });

  it("fires onSet with the clicked timeframe", async () => {
    const onSet = vi.fn();
    const pills = mount(TimeframePills, {
      props: { tf: "1D", onSet },
    });

    await pills.select("3M");

    expect(onSet).toHaveBeenCalledWith("3M");
  });

  it("re-renders the active pill when the tf prop changes", () => {
    const pills = mount(TimeframePills, {
      props: { tf: "1D", onSet: () => {} },
    });

    expect(pills.activeTf()).toBe("1D");

    pills.setProps({ tf: "1M" });

    expect(pills.activeTf()).toBe("1M");
  });
});
