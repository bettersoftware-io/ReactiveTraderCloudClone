import { afterEach, describe, expect, it } from "vitest";

import { DATA_SOURCE_STORAGE_KEY } from "@rtc/client-adapters";

import { LocalStorageDataSourceStore } from "#/adapters/LocalStorageDataSourceStore";

afterEach(() => {
  localStorage.clear();
});

describe("LocalStorageDataSourceStore", () => {
  it("reads null when nothing is stored", () => {
    expect(new LocalStorageDataSourceStore().read()).toBeNull();
  });

  it("round-trips a choice under the shared key", () => {
    const store = new LocalStorageDataSourceStore();
    store.write("live");
    expect(localStorage.getItem(DATA_SOURCE_STORAGE_KEY)).toBe("live");
    expect(new LocalStorageDataSourceStore().read()).toBe("live");
  });

  it("reads a corrupt value as absent rather than throwing", () => {
    localStorage.setItem(DATA_SOURCE_STORAGE_KEY, "banana");
    expect(new LocalStorageDataSourceStore().read()).toBeNull();
  });

  it("clear removes the key", () => {
    const store = new LocalStorageDataSourceStore();
    store.write("sim");
    store.clear();
    expect(localStorage.getItem(DATA_SOURCE_STORAGE_KEY)).toBeNull();
  });
});
