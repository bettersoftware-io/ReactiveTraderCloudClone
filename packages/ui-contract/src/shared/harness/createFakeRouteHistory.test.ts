import { describe, expect, it } from "vitest";

import type { AppRoute } from "@rtc/core-api";

import { createFakeRouteHistory } from "./createFakeRouteHistory";

describe("createFakeRouteHistory", () => {
  it("records pushes and replaces in order and keeps the path they wrote", () => {
    const history = createFakeRouteHistory();

    history.push({ area: "account", mode: "register" });
    history.replace({ area: "workspace", tab: "fx" });

    expect(history.writes).toEqual(["push /create-account", "replace /fx"]);
    expect(history.current()).toEqual({ area: "workspace", tab: "fx" });
  });

  it("traverse moves current() and tells subscribers, without recording a write", () => {
    const history = createFakeRouteHistory();
    history.push({ area: "account", mode: "register" });
    const heard: Array<AppRoute | null> = [];
    history.subscribe((route) => {
      heard.push(route);
    });

    history.traverse(history.path());
    history.traverse("");

    expect(heard).toEqual([{ area: "account", mode: "register" }, null]);
    expect(history.current()).toBeNull();
    expect(history.writes).toHaveLength(1);
  });

  it("tells no subscriber about its own push or replace", () => {
    const history = createFakeRouteHistory();
    const heard: Array<AppRoute | null> = [];
    history.subscribe((route) => {
      heard.push(route);
    });

    history.push({ area: "account", mode: "register" });
    history.replace({ area: "workspace", tab: "fx" });

    expect(heard).toEqual([]);
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

  it("is seeded by its initial path, naming no route for an unknown one", () => {
    const seeded = createFakeRouteHistory("/nowhere-known");

    expect(seeded.path()).toBe("/nowhere-known");
    expect(seeded.current()).toBeNull();
  });

  it("reads a recognised seed as its route", () => {
    const seeded = createFakeRouteHistory("/fx");

    expect(seeded.path()).toBe("/fx");
    expect(seeded.current()).toEqual({ area: "workspace", tab: "fx" });
  });
});
