import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredOwnKey } from "@rtc/core-api";

import {
  BrowserOwnKeyStore,
  OWN_KEY_STORAGE_KEY,
} from "#/adapters/BrowserOwnKeyStore";

const stored: StoredOwnKey = {
  owner: "alice",
  provider: "anthropic",
  key: "sk-ant-SECRET",
  capUsd: 2,
  remember: false,
};

describe("BrowserOwnKeyStore", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads null when nothing is stored", () => {
    expect(new BrowserOwnKeyStore().read()).toBeNull();
  });

  it("keeps a key for this session only in sessionStorage", () => {
    const store = new BrowserOwnKeyStore();

    store.write(stored);

    expect(store.read()).toEqual(stored);
    expect(sessionStorage.getItem(OWN_KEY_STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(OWN_KEY_STORAGE_KEY)).toBeNull();
  });

  it("remember moves the value to localStorage and removes the session copy", () => {
    const store = new BrowserOwnKeyStore();
    store.write(stored);

    store.write({ ...stored, remember: true });

    expect(sessionStorage.getItem(OWN_KEY_STORAGE_KEY)).toBeNull();
    expect(
      JSON.parse(localStorage.getItem(OWN_KEY_STORAGE_KEY) ?? "null"),
    ).toEqual({ ...stored, remember: true });
    expect(store.read()).toEqual({ ...stored, remember: true });
  });

  it("forgetting moves it back: the local copy is removed", () => {
    const store = new BrowserOwnKeyStore();
    store.write({ ...stored, remember: true });

    store.write(stored);

    expect(localStorage.getItem(OWN_KEY_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(OWN_KEY_STORAGE_KEY)).not.toBeNull();
  });

  it("read prefers sessionStorage over localStorage", () => {
    localStorage.setItem(
      OWN_KEY_STORAGE_KEY,
      JSON.stringify({ ...stored, key: "sk-ant-OLD", remember: true }),
    );
    sessionStorage.setItem(OWN_KEY_STORAGE_KEY, JSON.stringify(stored));

    expect(new BrowserOwnKeyStore().read()?.key).toBe("sk-ant-SECRET");
  });

  it("clear removes both copies", () => {
    const store = new BrowserOwnKeyStore();
    localStorage.setItem(OWN_KEY_STORAGE_KEY, JSON.stringify(stored));
    sessionStorage.setItem(OWN_KEY_STORAGE_KEY, JSON.stringify(stored));

    store.clear();

    expect(store.read()).toBeNull();
    expect(localStorage.getItem(OWN_KEY_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(OWN_KEY_STORAGE_KEY)).toBeNull();
  });

  it.each([
    ["not JSON", "{nope"],
    ["JSON null", "null"],
    ["a string", '"x"'],
    ["no owner", JSON.stringify({ ...stored, owner: undefined })],
    ["an unknown provider", JSON.stringify({ ...stored, provider: "acme" })],
    ["a non-string key", JSON.stringify({ ...stored, key: 7 })],
    ["a string cap", JSON.stringify({ ...stored, capUsd: "2" })],
    ["no remember flag", JSON.stringify({ ...stored, remember: undefined })],
  ])(
    "malformed stored data (%s) reads as null and is removed",
    (_label, raw) => {
      sessionStorage.setItem(OWN_KEY_STORAGE_KEY, raw);
      localStorage.setItem(OWN_KEY_STORAGE_KEY, raw);

      expect(new BrowserOwnKeyStore().read()).toBeNull();
      expect(sessionStorage.getItem(OWN_KEY_STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(OWN_KEY_STORAGE_KEY)).toBeNull();
    },
  );

  it("a null cap is a valid stored value", () => {
    const store = new BrowserOwnKeyStore();
    store.write({ ...stored, capUsd: null });

    expect(store.read()?.capUsd).toBeNull();
  });

  it("storage that throws reads as null and never throws", () => {
    function boom(): never {
      throw new Error("storage unavailable");
    }

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
    const store = new BrowserOwnKeyStore();

    expect(store.read()).toBeNull();
    expect(() => {
      store.write(stored);
      store.write({ ...stored, remember: true });
      store.clear();
    }).not.toThrow();
  });
});
