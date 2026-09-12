import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalStorageDockLayoutStore } from "./LocalStorageDockLayoutStore";

describe("LocalStorageDockLayoutStore", () => {
  afterEach(() => {
    localStorage.removeItem("rtc-dock-layout-fx");
    localStorage.removeItem("rtc-dock-layout-credit");
  });

  it("returns null when nothing is stored", () => {
    expect(new LocalStorageDockLayoutStore().load("fx")).toBeNull();
  });

  it("round-trips a blob per tab independently", () => {
    const store = new LocalStorageDockLayoutStore();
    store.save("fx", '{"a":1}');
    store.save("credit", '{"b":2}');
    expect(store.load("fx")).toBe('{"a":1}');
    expect(store.load("credit")).toBe('{"b":2}');
  });

  it("swallows storage failures (best-effort persistence)", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    expect(() => {
      return new LocalStorageDockLayoutStore().save("fx", "x");
    }).not.toThrow();
    spy.mockRestore();
  });

  it("clear round-trips: removes the tab's blob and leaves the other tab's alone", () => {
    const store = new LocalStorageDockLayoutStore();
    store.save("fx", '{"a":1}');
    store.save("credit", '{"b":2}');

    store.clear("fx");

    expect(store.load("fx")).toBeNull();
    expect(store.load("credit")).toBe('{"b":2}');
  });

  it("swallows storage failures on clear (best-effort, matches save)", () => {
    const spy = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(() => {
      return new LocalStorageDockLayoutStore().clear("fx");
    }).not.toThrow();
    spy.mockRestore();
  });
});
