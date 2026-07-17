import AsyncStorage from "@react-native-async-storage/async-storage";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredSession } from "@rtc/client-core";
import type { SessionUser } from "@rtc/domain";

import {
  AsyncStorageSessionStore,
  SESSION_STORAGE_KEY,
} from "#/app/adapters/AsyncStorageSessionStore";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
});

vi.mock("@react-native-async-storage/async-storage", () => {
  return {
    default: {
      getItem: (key: string) => {
        return Promise.resolve(store.get(key) ?? null);
      },
      setItem: (key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        store.delete(key);
        return Promise.resolve();
      },
    },
  };
});

const USER: SessionUser = {
  name: "Anthony Stark",
  initials: "AS",
  role: "Senior FX Trader",
  id: "TRD-0042",
  email: "a.stark@reactivetrader.io",
  desk: "G10 Spot · London",
  clearance: "LEVEL 4 · FULL",
};

const SESSION: StoredSession = {
  token: "tok-1",
  user: USER,
  username: "astark",
  exp: 9_000_000,
};

describe("AsyncStorageSessionStore", () => {
  it("hydrate() resumes a persisted session into a synchronous read()", async () => {
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(SESSION));

    const session = await AsyncStorageSessionStore.hydrate();

    expect(session.read()).toEqual(SESSION);
  });

  it("hydrate() returns an empty store when nothing is persisted", async () => {
    const session = await AsyncStorageSessionStore.hydrate();

    expect(session.read()).toBeNull();
  });

  it("write() updates read() synchronously and persists for the next hydrate", async () => {
    const session = await AsyncStorageSessionStore.hydrate();

    session.write(SESSION);
    expect(session.read()).toEqual(SESSION);

    const next = await AsyncStorageSessionStore.hydrate();
    expect(next.read()).toEqual(SESSION);
  });

  it("clear() empties read() and removes the persisted state", async () => {
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(SESSION));
    const session = await AsyncStorageSessionStore.hydrate();

    session.clear();
    expect(session.read()).toBeNull();

    const next = await AsyncStorageSessionStore.hydrate();
    expect(next.read()).toBeNull();
  });

  it("hydrate() tolerates corrupt persisted JSON by returning an empty store", async () => {
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, "{not json");

    const session = await AsyncStorageSessionStore.hydrate();

    expect(session.read()).toBeNull();
  });

  it("hydrate() rejects a structurally invalid persisted session", async () => {
    await AsyncStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ token: "t", username: "astark", exp: 1 }),
    );

    const session = await AsyncStorageSessionStore.hydrate();

    expect(session.read()).toBeNull();
  });
});
