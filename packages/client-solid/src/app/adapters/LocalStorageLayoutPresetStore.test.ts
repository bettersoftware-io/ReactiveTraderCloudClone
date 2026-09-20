import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalStorageLayoutPresetStore } from "./LocalStorageLayoutPresetStore";

describe("LocalStorageLayoutPresetStore", () => {
  afterEach(() => {
    localStorage.removeItem("rtc-layout-presets-fx");
    localStorage.removeItem("rtc-layout-presets-credit");
  });

  it("returns null when nothing is stored", () => {
    expect(new LocalStorageLayoutPresetStore().load("fx")).toBeNull();
  });

  it("round-trips a serialized list per tab independently", () => {
    const store = new LocalStorageLayoutPresetStore();
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
      return new LocalStorageLayoutPresetStore().save("fx", "x");
    }).not.toThrow();
    spy.mockRestore();
  });

  it("swallows storage failures on load, returning null", () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(new LocalStorageLayoutPresetStore().load("fx")).toBeNull();
    spy.mockRestore();
  });

  it("clear round-trips: removes the tab's list and leaves the other tab's alone", () => {
    const store = new LocalStorageLayoutPresetStore();
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
      return new LocalStorageLayoutPresetStore().clear("fx");
    }).not.toThrow();
    spy.mockRestore();
  });
});
