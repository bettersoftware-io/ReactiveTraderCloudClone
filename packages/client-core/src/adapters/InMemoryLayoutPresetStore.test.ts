import { describe, expect, it } from "vitest";

import { InMemoryLayoutPresetStore } from "#/adapters/InMemoryLayoutPresetStore";

describe("InMemoryLayoutPresetStore", () => {
  it("returns null on load when nothing was saved for the tab", () => {
    const store = new InMemoryLayoutPresetStore();
    expect(store.load("fx")).toBeNull();
  });

  it("round-trips a saved serialized list for one tab", () => {
    const store = new InMemoryLayoutPresetStore();
    store.save("fx", '[{"id":"a"}]');
    expect(store.load("fx")).toBe('[{"id":"a"}]');
  });

  it("keeps each tab's serialized list independent", () => {
    const store = new InMemoryLayoutPresetStore();
    store.save("fx", '[{"id":"a"}]');
    store.save("credit", '[{"id":"b"}]');
    expect(store.load("fx")).toBe('[{"id":"a"}]');
    expect(store.load("credit")).toBe('[{"id":"b"}]');
    expect(store.load("admin")).toBeNull();
  });

  it("overwrites a tab's serialized list on a second save", () => {
    const store = new InMemoryLayoutPresetStore();
    store.save("fx", '[{"id":"a"}]');
    store.save("fx", '[{"id":"a2"}]');
    expect(store.load("fx")).toBe('[{"id":"a2"}]');
  });

  it("clear round-trips: removes the tab's list and leaves the other tab's alone", () => {
    const store = new InMemoryLayoutPresetStore();
    store.save("fx", '[{"id":"a"}]');
    store.save("credit", '[{"id":"b"}]');

    store.clear("fx");

    expect(store.load("fx")).toBeNull();
    expect(store.load("credit")).toBe('[{"id":"b"}]');
  });
});
