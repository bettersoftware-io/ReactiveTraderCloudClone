import { describe, expect, it } from "vitest";
import { findRosterUser, ROSTER } from "#/auth/roster";

describe("roster", () => {
  it("contains only public profiles (no password fields)", () => {
    for (const entry of ROSTER) {
      expect(entry).not.toHaveProperty("password");
      expect(typeof entry.user.name).toBe("string");
    }
  });
  it("looks up by username", () => {
    expect(findRosterUser("demo")?.user.name).toBeDefined();
    expect(findRosterUser("nobody")).toBeUndefined();
  });
});
