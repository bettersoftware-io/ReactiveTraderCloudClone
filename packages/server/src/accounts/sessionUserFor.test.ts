import { describe, expect, it } from "vitest";

import type { AccountRecord } from "#/accounts/AccountDirectory";
import { sessionUserFor } from "#/accounts/sessionUserFor";

describe("sessionUserFor", () => {
  it("derives a user's profile card", () => {
    expect(sessionUserFor(createAccount("user"))).toEqual({
      name: "Ann Lee",
      initials: "AL",
      role: "Guest Trader",
      id: "USR-1F3A",
      email: "ann@desk.io",
      desk: "Guest · Cloud",
      clearance: "LEVEL 2 · DESK",
      access: "user",
    });
  });

  it("derives an admin's profile card", () => {
    const user = sessionUserFor(createAccount("admin"));

    expect(user.role).toBe("Desk Administrator");
    expect(user.clearance).toBe("LEVEL 5 · ADMIN");
    expect(user.access).toBe("admin");
  });
});

function createAccount(access: "user" | "admin"): AccountRecord {
  return {
    id: "1f3a9c2e-0000-4000-8000-000000000000",
    email: "ann@desk.io",
    displayName: "Ann Lee",
    access,
    status: "active",
  };
}
