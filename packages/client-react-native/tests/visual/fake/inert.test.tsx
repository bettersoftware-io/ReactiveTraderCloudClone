import { describe, expect, it } from "@jest/globals";

import { inertSlice } from "./inert";

describe("inertSlice", () => {
  it("has exactly the 24 hooks InertSlice names — no more, no fewer", () => {
    const expectedKeys = [
      "useAnimationIntents",
      "useDockedPanelIds",
      "useDockLayoutStore",
      "useEventLog",
      "useJarvis",
      "useJarvisDemo",
      "useJarvisDriver",
      "useJarvisPanelData",
      "useJarvisPanels",
      "useJarvisPreferences",
      "useJarvisUsage",
      "useLayout",
      "useLayoutEngine",
      "useLayoutPresets",
      "useMetrics",
      "useRegisterLayoutSnapshot",
      "useReportDetachedPanels",
      "useSessionCountSeries",
      "useSessions",
      "useThroughput",
      "useTopology",
      "useWorkspaceLayoutResets",
      "useWorkspaceNav",
      "useWorkspaceReset",
    ].sort();

    expect(Object.keys(inertSlice).sort()).toStrictEqual(expectedKeys);
    expect(Object.keys(inertSlice)).toHaveLength(expectedKeys.length);
  });
});

describe("inertSlice.useAnimationIntents", () => {
  it("returns null for any target, on every call", () => {
    const first = inertSlice.useAnimationIntents("tile:EURUSD");
    const second = inertSlice.useAnimationIntents("banner:connection");

    expect(first).toBeNull();
    expect(second).toBeNull();
  });
});

describe("inertSlice.useEventLog", () => {
  it("returns the same empty array, by reference, on every call", () => {
    const first = inertSlice.useEventLog();
    const second = inertSlice.useEventLog();

    expect(second).toBe(first);
    expect(first).toHaveLength(0);
  });
});

describe("inertSlice.useJarvis", () => {
  it("returns the same result, by reference, on every call", () => {
    const first = inertSlice.useJarvis();
    const second = inertSlice.useJarvis();

    expect(second).toBe(first);
  });

  it("starts closed, idle, with an empty transcript and no brains on offer", () => {
    const { state } = inertSlice.useJarvis();

    expect(state.open).toBe(false);
    expect(state.available).toBe(false);
    expect(state.phase).toBe("idle");
    expect(state.unread).toBe(0);
    expect(state.unreadNarration).toBe(false);
    expect(state.openCount).toBe(0);
    expect(state.entries).toHaveLength(0);
    expect(state.brains).toHaveLength(0);
    expect(state.pendingConfirmation).toBeNull();
    expect(state.gate).toBeNull();
  });

  it("every intent is callable, throws nothing, and leaves the next read unchanged", () => {
    const before = inertSlice.useJarvis();

    expect(() => {
      before.open();
      before.close();
      before.toggle();
      before.send("hello");
      before.narrate("[narration] hello");
      before.sendScripted("hello");
      before.approveConfirmation();
      before.declineConfirmation();
      before.setSkin("reactor");
    }).not.toThrow();

    expect(inertSlice.useJarvis()).toBe(before);
  });
});

describe("inertSlice.useJarvisDemo", () => {
  it("returns the same result, by reference, on every call", () => {
    const first = inertSlice.useJarvisDemo();
    const second = inertSlice.useJarvisDemo();

    expect(second).toBe(first);
  });

  it("starts idle, at step 0, with no in-flight label", () => {
    const { state } = inertSlice.useJarvisDemo();

    expect(state.running).toBe(false);
    expect(state.stepIndex).toBe(0);
    expect(state.label).toBeNull();
    expect(state.stepCount).toBeGreaterThan(0);
  });

  it("every intent is callable, throws nothing, and leaves the next read unchanged", () => {
    const before = inertSlice.useJarvisDemo();

    expect(() => {
      before.startDemo();
      before.stopDemo();
    }).not.toThrow();

    expect(inertSlice.useJarvisDemo()).toBe(before);
  });
});

describe("inertSlice.useJarvisDriver", () => {
  it("returns the same empty-batch state, by reference, on every call", () => {
    const first = inertSlice.useJarvisDriver();
    const second = inertSlice.useJarvisDriver();

    expect(second).toBe(first);
    expect(first.lastBatch).toHaveLength(0);
  });
});

describe("inertSlice.useJarvisPanelData", () => {
  it("returns null for any panelId, on every call", () => {
    const first = inertSlice.useJarvisPanelData("panel-1");
    const second = inertSlice.useJarvisPanelData("panel-2");

    expect(first).toBeNull();
    expect(second).toBeNull();
  });
});

describe("inertSlice.useJarvisPanels", () => {
  it("returns the same result, by reference, on every call", () => {
    const first = inertSlice.useJarvisPanels();
    const second = inertSlice.useJarvisPanels();

    expect(second).toBe(first);
    expect(first.panels).toHaveLength(0);
  });

  it("dismissPanel is callable, throws nothing, and leaves the next read unchanged", () => {
    const before = inertSlice.useJarvisPanels();

    expect(() => {
      before.dismissPanel("panel-1");
    }).not.toThrow();

    expect(inertSlice.useJarvisPanels()).toBe(before);
  });
});

describe("inertSlice.useJarvisPreferences", () => {
  it("returns the same result, by reference, on every call", () => {
    const first = inertSlice.useJarvisPreferences();
    const second = inertSlice.useJarvisPreferences();

    expect(second).toBe(first);
  });

  it("every setter is callable, throws nothing, and leaves the next read unchanged", () => {
    const before = inertSlice.useJarvisPreferences();

    expect(() => {
      before.setBrain("claude-opus-5");
      before.setEffort("high");
      before.setNarrator("off");
    }).not.toThrow();

    expect(inertSlice.useJarvisPreferences()).toBe(before);
  });
});

describe("inertSlice.useJarvisUsage", () => {
  it("returns null on every call", () => {
    expect(inertSlice.useJarvisUsage()).toBeNull();
    expect(inertSlice.useJarvisUsage()).toBeNull();
  });
});

describe("inertSlice.useLayout", () => {
  it("returns the same result, by reference, regardless of which tab is requested", () => {
    const first = inertSlice.useLayout("fx");
    const second = inertSlice.useLayout("equities");

    expect(second).toBe(first);
  });

  it("has no maximized or collapsed panels", () => {
    const { state } = inertSlice.useLayout("fx");

    expect(state.maximized).toBeNull();
    expect(state.collapsed).toHaveLength(0);
  });

  it("every intent is callable, throws nothing, and leaves the next read unchanged", () => {
    const before = inertSlice.useLayout("fx");

    expect(() => {
      before.maximize("fx-rates");
      before.restore();
      before.collapse("fx-rates");
      before.expand("fx-rates");
      before.resize([0], [0.5, 0.5]);
    }).not.toThrow();

    expect(inertSlice.useLayout("fx")).toBe(before);
  });
});

describe("inertSlice.useLayoutPresets", () => {
  it("returns the same result, by reference, regardless of which tab is requested", () => {
    const first = inertSlice.useLayoutPresets("fx");
    const second = inertSlice.useLayoutPresets("equities");

    expect(second).toBe(first);
  });

  it("starts with an empty preset list", () => {
    const { presets } = inertSlice.useLayoutPresets("fx");

    expect(presets).toHaveLength(0);
  });

  it("save reports unavailable, load reports not-found, remove/resetTab are callable and leave the next read unchanged", () => {
    const before = inertSlice.useLayoutPresets("fx");

    expect(before.save("My Layout")).toStrictEqual({ status: "unavailable" });
    expect(before.load("preset-1")).toBe(false);
    expect(() => {
      before.remove("preset-1");
      before.resetTab();
    }).not.toThrow();

    expect(inertSlice.useLayoutPresets("fx")).toBe(before);
  });
});

describe("inertSlice.useMetrics", () => {
  it("returns the same result, by reference, on every call", () => {
    const first = inertSlice.useMetrics();
    const second = inertSlice.useMetrics();

    expect(second).toBe(first);
  });

  it("every series starts empty", () => {
    const { throughput, latency, errorRate } = inertSlice.useMetrics();

    expect(throughput).toHaveLength(0);
    expect(latency).toHaveLength(0);
    expect(errorRate).toHaveLength(0);
  });
});

describe("inertSlice.useRegisterLayoutSnapshot", () => {
  it("returns a callable no-op, on every call", () => {
    const register = inertSlice.useRegisterLayoutSnapshot();

    expect(() => {
      register("fx", () => {
        return "{}";
      });
      register("fx", null);
    }).not.toThrow();
  });
});

describe("inertSlice.useSessionCountSeries", () => {
  it("returns the same empty array, by reference, on every call", () => {
    const first = inertSlice.useSessionCountSeries();
    const second = inertSlice.useSessionCountSeries();

    expect(second).toBe(first);
    expect(first).toHaveLength(0);
  });
});

describe("inertSlice.useSessions", () => {
  it("returns the same empty array, by reference, on every call", () => {
    const first = inertSlice.useSessions();
    const second = inertSlice.useSessions();

    expect(second).toBe(first);
    expect(first).toHaveLength(0);
  });
});

describe("inertSlice.useThroughput", () => {
  it("returns the same result, by reference, on every call", () => {
    const first = inertSlice.useThroughput();
    const second = inertSlice.useThroughput();

    expect(second).toBe(first);
  });

  it("starts at 0, not loading, with no message", () => {
    const result = inertSlice.useThroughput();

    expect(result.value).toBe(0);
    expect(result.loading).toBe(false);
    expect(result.message).toBeNull();
  });

  it("setValue is callable, throws nothing, and leaves the next read unchanged", () => {
    const before = inertSlice.useThroughput();

    expect(() => {
      before.setValue(250);
    }).not.toThrow();

    expect(inertSlice.useThroughput()).toBe(before);
  });
});

describe("inertSlice.useTopology", () => {
  it("returns null on every call", () => {
    expect(inertSlice.useTopology()).toBeNull();
    expect(inertSlice.useTopology()).toBeNull();
  });
});

describe("inertSlice.useWorkspaceNav", () => {
  it("returns the same result, by reference, on every call", () => {
    const first = inertSlice.useWorkspaceNav();
    const second = inertSlice.useWorkspaceNav();

    expect(second).toBe(first);
  });

  it("has a fixed active tab", () => {
    const { state } = inertSlice.useWorkspaceNav();

    expect(state.activeTab).toBe("fx");
  });

  it("switchTab is callable, throws nothing, and leaves the next read unchanged (no live state)", () => {
    const before = inertSlice.useWorkspaceNav();

    expect(() => {
      before.switchTab("equities");
    }).not.toThrow();

    const after = inertSlice.useWorkspaceNav();
    expect(after).toBe(before);
    expect(after.state.activeTab).toBe("fx");
  });
});
