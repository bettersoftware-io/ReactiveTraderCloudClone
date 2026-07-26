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

  // "{not json" above is caught by JSON.parse's throw. These are the harder
  // case: VALID JSON that is not a session. They reach the shape guards, which
  // is what stands between a half-written storage entry and an app booting with
  // a session object whose `user` is undefined.
  it.each([
    ["a bare string", '"just-a-string"'],
    ["a number", "42"],
    ["null", "null"],
    ["an array", "[]"],
  ])("returns null when the stored value is %s", (_label, raw) => {
    localStorage.setItem(SESSION_STORAGE_KEY, raw);
    const store = new LocalStorageSessionStore();

    expect(store.read()).toBeNull();
  });

  it("returns null when the session is well-formed but the user is not an object", () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        token: "t",
        username: "demo",
        exp: 1,
        user: "not-a-user",
      }),
    );
    const store = new LocalStorageSessionStore();

    expect(store.read()).toBeNull();
  });

  it("returns null when the user object is missing a required field", () => {
    // Drops `clearance` only — everything else is valid, so this pins that the
    // guard checks every field rather than just probing one or two.
    const { clearance: _dropped, ...partialUser } = testUser;

    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        token: "t",
        username: "demo",
        exp: 1,
        user: partialUser,
      }),
    );
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
