import { describe, expect, it } from "vitest";

import { InMemoryDockLayoutStore } from "#/adapters/InMemoryDockLayoutStore";

describe("InMemoryDockLayoutStore", () => {
  it("returns null on load when nothing was saved for the tab", () => {
    const store = new InMemoryDockLayoutStore();
    expect(store.load("fx")).toBeNull();
  });

  it("round-trips a saved blob for one tab", () => {
    const store = new InMemoryDockLayoutStore();
    store.save("fx", '{"a":1}');
    expect(store.load("fx")).toBe('{"a":1}');
  });

  it("keeps each tab's blob independent", () => {
    const store = new InMemoryDockLayoutStore();
    store.save("fx", '{"a":1}');
    store.save("credit", '{"b":2}');
    expect(store.load("fx")).toBe('{"a":1}');
    expect(store.load("credit")).toBe('{"b":2}');
    expect(store.load("admin")).toBeNull();
  });

  it("overwrites a tab's blob on a second save", () => {
    const store = new InMemoryDockLayoutStore();
    store.save("fx", '{"a":1}');
    store.save("fx", '{"a":2}');
    expect(store.load("fx")).toBe('{"a":2}');
  });
});
