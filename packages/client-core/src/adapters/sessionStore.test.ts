import { describe, expect, it } from "vitest";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import type { StoredSession } from "#/adapters/sessionStore";

describe("InMemorySessionStore", () => {
  it("returns null on initial read", () => {
    const store = new InMemorySessionStore();
    const result = store.read();
    expect(result).toBeNull();
  });

  it("returns the written session after write", () => {
    const store = new InMemorySessionStore();
    const session: StoredSession = {
      token: "test-token-123",
      user: {
        name: "John Doe",
        initials: "JD",
        role: "trader",
        id: "user-123",
        email: "john@example.com",
        desk: "FX",
        clearance: "level-2",
      },
      username: "jdoe",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    store.write(session);
    const result = store.read();

    expect(result).toEqual(session);
  });

  it("returns null after clear", () => {
    const store = new InMemorySessionStore();
    const session: StoredSession = {
      token: "test-token-123",
      user: {
        name: "John Doe",
        initials: "JD",
        role: "trader",
        id: "user-123",
        email: "john@example.com",
        desk: "FX",
        clearance: "level-2",
      },
      username: "jdoe",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    store.write(session);
    store.clear();
    const result = store.read();

    expect(result).toBeNull();
  });

  it("returns expired session as-is (expiry is presenter concern)", () => {
    const store = new InMemorySessionStore();
    const expiredSession: StoredSession = {
      token: "expired-token",
      user: {
        name: "Jane Smith",
        initials: "JS",
        role: "analyst",
        id: "user-456",
        email: "jane@example.com",
        desk: "Credit",
        clearance: "level-1",
      },
      username: "jsmith",
      exp: Math.floor(Date.now() / 1000) - 3600,
    };

    store.write(expiredSession);
    const result = store.read();

    expect(result).toEqual(expiredSession);
  });
});
