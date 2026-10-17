/**
 * Workspace path routes (spec §5), over the real `App` shell (`AppShell`,
 * as the HeaderChrome and JarvisDriver specs mount it): the URL's tab wins
 * on mount, every later tab change pushes its route, and Back/Forward
 * switches to the tab the history lands on. Every mount is seeded with a
 * fake page history (`routePath`).
 */

import { AppShell } from "@ui-contract/components";
import { DRIVE_SETTLE_MS } from "@ui-contract/harness/driveSettle";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
  cleanupMounted();
});

describe("Workspace routes — mount", () => {
  it("replaces an empty path with the tab on screen", () => {
    const app = mount(AppShell, { routePath: "" });

    expect(app.header.isActive("fx")).toBe(true);
    expect(app.routeWrites()).toEqual(["replace /fx"]);
  });

  it("switches to the tab the URL names, writing nothing", () => {
    const app = mount(AppShell, { routePath: "/credit" });

    expect(app.header.isActive("credit")).toBe(true);
    expect(app.routeWrites()).toEqual([]);
  });
});

describe("Workspace routes — tab changes push", () => {
  it("pushes the tab a click opens", async () => {
    const app = mount(AppShell, { routePath: "/fx" });

    await app.header.clickTab("equities");

    expect(app.header.isActive("equities")).toBe(true);
    expect(app.routeWrites()).toEqual(["push /equities"]);
  });

  it("pushes the tab a Jarvis switchTab command opens", async () => {
    const app = mount(AppShell, { routePath: "/fx" });

    await app.overlay.pressHotkey();
    await app.overlay.send("switch to admin");

    vi.useFakeTimers();
    app.overlay.emitEvents([
      {
        type: "command",
        batch: { v: 1, commands: [{ kind: "switchTab", tab: "admin" }] },
      },
      { type: "done" },
    ]);
    await vi.advanceTimersByTimeAsync(DRIVE_SETTLE_MS);

    expect(app.header.isActive("admin")).toBe(true);
    expect(app.routeWrites()).toEqual(["push /admin"]);
  });
});

describe("Workspace routes — Back and Forward", () => {
  it("switches to the tab the history lands on, writing nothing", async () => {
    const app = mount(AppShell, { routePath: "/fx" });

    await app.header.clickTab("credit");
    await app.traverse("/fx");

    expect(app.header.isActive("fx")).toBe(true);
    expect(app.routeWrites()).toEqual(["push /credit"]);
  });

  it("rewrites a login route the history lands on to the tab on screen", async () => {
    const app = mount(AppShell, { routePath: "/credit" });

    await app.traverse("/create-account");

    expect(app.header.isActive("credit")).toBe(true);
    expect(app.routeWrites()).toEqual(["replace /credit"]);
    expect(app.routePath()).toBe("/credit");
  });
});
