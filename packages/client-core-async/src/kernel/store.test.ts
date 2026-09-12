import { describe, expect, it } from "vitest";

import { createStore } from "#/kernel/store";

describe("Store", () => {
  it("get() returns the current value synchronously", () => {
    const store = createStore(1);
    expect(store.get()).toBe(1);
  });

  it("subscribe() delivers the current value synchronously, then every change", () => {
    const store = createStore("a");
    const seen: string[] = [];
    const stop = store.subscribe((v) => {
      seen.push(v);
    });
    store.set("b");
    store.set((prev) => {
      return `${prev}c`;
    });
    expect(seen).toEqual(["a", "b", "bc"]);
    stop();
    store.set("d");
    expect(seen).toEqual(["a", "b", "bc"]);
  });

  it("set() with an identical value (Object.is) does not notify", () => {
    const store = createStore(0);
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    store.set(0);
    expect(notifications).toBe(1);
  });
});
