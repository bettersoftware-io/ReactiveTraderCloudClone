import { describe, expect, it } from "vitest";

import type { AppRoute } from "@rtc/core-api";

import { createFakeRouteHistory } from "./createFakeRouteHistory";

describe("createFakeRouteHistory", () => {
  it("records pushes and replaces in order and keeps the hash they wrote", () => {
    const history = createFakeRouteHistory();

    history.push({ area: "account", mode: "register" });
    history.replace({ area: "workspace", tab: "fx" });

    expect(history.writes).toHaveLength(2);
    expect(history.writes[0]).toMatch(/^push #/);
    expect(history.writes[1]).toMatch(/^replace #/);
    expect(history.current()).toEqual({ area: "workspace", tab: "fx" });
  });

  it("traverse moves current() and tells subscribers, without recording a write", () => {
    const history = createFakeRouteHistory();
    history.push({ area: "account", mode: "register" });
    const heard: Array<AppRoute | null> = [];
    history.subscribe((route) => {
      heard.push(route);
    });

    history.traverse(history.hash());
    history.traverse("");

    expect(heard).toEqual([{ area: "account", mode: "register" }, null]);
    expect(history.current()).toBeNull();
    expect(history.writes).toHaveLength(1);
  });

  it("stops delivering to a listener after it unsubscribes", () => {
    const history = createFakeRouteHistory();
    const heard: Array<AppRoute | null> = [];
    const unsubscribe = history.subscribe((route) => {
      heard.push(route);
    });

    unsubscribe();
    history.traverse("");

    expect(heard).toEqual([]);
  });

  it("is seeded by its initial hash", () => {
    const seeded = createFakeRouteHistory("#/nowhere-known");

    expect(seeded.hash()).toBe("#/nowhere-known");
  });
});
