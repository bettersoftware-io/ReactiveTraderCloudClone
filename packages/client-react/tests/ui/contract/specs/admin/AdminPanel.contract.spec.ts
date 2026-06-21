import { describe, it, expect, afterEach } from "vitest";
import { mount, cleanupMounted } from "@ui-contract/mount";
import { AdminPanel } from "@ui-contract/components";

afterEach(() => {
  cleanupMounted();
});

describe("AdminPanel", () => {
  it("shows a loading placeholder until the throughput view is loaded", () => {
    const panel = mount(AdminPanel, { throughput: { loading: true } });
    expect(panel.isLoading()).toBe(true);
  });

  it("renders the throughput control seeded from the loaded view", async () => {
    const panel = mount(AdminPanel, { throughput: { value: 250, loading: false } });
    await panel.waitUntilLoaded();
    expect(panel.heading()).toBe("Throughput Control");
    expect(panel.value()).toBe(250);
    expect(panel.sliderValue()).toBe(250);
    expect(panel.message()).toBeNull();
  });

  it("records an edited value and reflects it optimistically", async () => {
    const panel = mount(AdminPanel, { throughput: { value: 100, loading: false } });
    await panel.waitUntilLoaded();

    await panel.setValue(420);
    expect(panel.value()).toBe(420);

    // The panel asked the seam to persist 420 (old debounced-PUT body).
    expect(panel.recordedSets()).toContain(420);
  });

  it("confirms a persisted value through a server-pushed status banner", async () => {
    const panel = mount(AdminPanel, { throughput: { value: 100, loading: false } });
    await panel.waitUntilLoaded();

    await panel.setValue(420);
    // The seam (presenter) would surface the confirmation; the harness models
    // that push directly. The dumb panel just renders whatever message it gets.
    panel.pushView({
      message: { text: "Throughput has been set to 420", isError: false },
    });
    expect(panel.message()).toMatch(/has been set to 420/i);
  });

  it("mirrors a slider move into the numeric input and records it", async () => {
    const panel = mount(AdminPanel, { throughput: { value: 100, loading: false } });
    await panel.waitUntilLoaded();

    panel.dragSlider(600);
    expect(panel.value()).toBe(600);
    expect(panel.sliderValue()).toBe(600);
    expect(panel.recordedSets()).toContain(600);
  });

  it("rejects an out-of-range numeric entry", async () => {
    const panel = mount(AdminPanel, { throughput: { value: 100, loading: false } });
    await panel.waitUntilLoaded();

    // 2000 exceeds the 0..1000 range; the last in-range keystroke (200) sticks.
    await panel.setValue(2000);
    expect(panel.value()).toBe(200);
  });

  it("renders a server-pushed error banner", async () => {
    const panel = mount(AdminPanel, { throughput: { value: 100, loading: false } });
    await panel.waitUntilLoaded();

    panel.dragSlider(800);
    panel.pushView({
      message: { text: "Error setting throughput", isError: true },
    });
    expect(panel.message()).toMatch(/error setting throughput/i);
  });
});
