import { beforeEach, describe, expect, it } from "vitest";

import type { StoredSession } from "@rtc/client-core";
import type { SessionUser } from "@rtc/domain";

import {
  LocalStorageSessionStore,
  SESSION_STORAGE_KEY,
} from "./LocalStorageSessionStore";

const testUser: SessionUser = {
  name: "Demo User",
  initials: "DU",
  role: "trader",
  id: "user-1",
  email: "demo@example.com",
  desk: "FX",
  clearance: "standard",
};

const testSession: StoredSession = {
  token: "test-token",
  user: testUser,
  username: "demo",
  exp: 1_700_000_000,
};

describe("LocalStorageSessionStore (jsdom localStorage)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a full StoredSession through write then read", () => {
    const store = new LocalStorageSessionStore();

    store.write(testSession);

    expect(store.read()).toEqual(testSession);
  });

  it("returns null when the key is missing", () => {
    const store = new LocalStorageSessionStore();

    expect(store.read()).toBeNull();
  });

  it("returns null and tolerates corrupt JSON in the key", () => {
    localStorage.setItem(SESSION_STORAGE_KEY, "{not json");
    const store = new LocalStorageSessionStore();

    expect(store.read()).toBeNull();
  });

  it("removes the stored session on clear", () => {
    const store = new LocalStorageSessionStore();

    store.write(testSession);
    store.clear();

    expect(store.read()).toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });
});
