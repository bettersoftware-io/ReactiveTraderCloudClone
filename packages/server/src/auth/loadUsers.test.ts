import { describe, expect, it } from "vitest";

import { parseAuthUsers } from "#/auth/loadUsers";

// AuthService.test.ts exercises the happy path (`a:1 , b:2 ,` — blanks and
// trimming). The rejection paths had no test, and they are the ones that decide
// whether a typo'd AUTH_USERS secret silently yields an empty roster: every
// login then fails with "invalid credentials" and nothing says why. Pinning
// them makes the intended behaviour — skip the bad entry, keep the good ones —
// explicit rather than incidental.

describe("parseAuthUsers", () => {
  it("returns an empty map for an unset secret", () => {
    expect(parseAuthUsers(undefined).size).toBe(0);
  });

  it("returns an empty map for an empty secret", () => {
    expect(parseAuthUsers("").size).toBe(0);
  });

  it("parses a single pair", () => {
    expect([...parseAuthUsers("demo:pw")]).toEqual([["demo", "pw"]]);
  });

  it.each([
    ["an entry with no separator", "nocolon"],
    ["an entry with an empty username", ":pw"],
    ["an entry with an empty password", "user:"],
    ["an entry that is only a separator", ":"],
    ["whitespace either side of the separator", "  :  "],
  ])("skips %s", (_label, raw) => {
    expect(parseAuthUsers(raw).size).toBe(0);
  });

  it("keeps the valid entries when one entry is malformed", () => {
    // The important half: one bad pair must not take the whole roster down.
    expect([...parseAuthUsers("good:pw,nocolon,other:pw2")]).toEqual([
      ["good", "pw"],
      ["other", "pw2"],
    ]);
  });

  it("keeps only the last value when a username repeats", () => {
    expect(parseAuthUsers("dup:first,dup:second").get("dup")).toBe("second");
  });

  it("preserves a password containing colons", () => {
    // Split on the FIRST colon only — otherwise any password with a colon in it
    // would be silently truncated at login time.
    expect(parseAuthUsers("demo:a:b:c").get("demo")).toBe("a:b:c");
  });
});
