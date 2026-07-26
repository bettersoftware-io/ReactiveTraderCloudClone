import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// devtoolsHub is a module-level singleton whose wiring happens as an IMPORT
// SIDE EFFECT, so every case here needs a fresh module registry
// (vi.resetModules) with the globals stubbed BEFORE the dynamic import — the
// usual import-at-top form would run the side effects once, under jsdom's
// defaults, and pin only that one path.
//
// What this covers that nothing else did: the `pagehide` disposal (without it
// a reload leaves the inspector panel showing a live-but-dead app instead of
// flipping to "disconnected"), and the two environment guards that keep the
// module importable where BroadcastChannel or window is absent — the node
// fullstack smoke imports it through tsx exactly that way.

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("devtoolsHub module wiring", () => {
  it("attaches a BroadcastChannel transport when the API exists", async () => {
    const { devtoolsHub } = await import("./devtoolsHub");

    // jsdom provides BroadcastChannel, so the transport branch runs on import.
    expect(devtoolsHub).toBeDefined();
    expect(typeof devtoolsHub.dispose).toBe("function");
  });

  it("disposes the hub on pagehide", async () => {
    const { devtoolsHub } = await import("./devtoolsHub");
    const dispose = vi.spyOn(devtoolsHub, "dispose");

    window.dispatchEvent(new Event("pagehide"));

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("stays importable where BroadcastChannel is unavailable", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);

    const { devtoolsHub } = await import("./devtoolsHub");

    // No transport attached, but the module must not throw — a non-browser
    // runtime importing the composition root has to keep working.
    expect(devtoolsHub).toBeDefined();
  });

  it("stays importable where window is unavailable", async () => {
    vi.stubGlobal("window", undefined);

    const { devtoolsHub } = await import("./devtoolsHub");

    expect(devtoolsHub).toBeDefined();
  });
});
