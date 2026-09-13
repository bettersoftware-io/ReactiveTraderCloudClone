import { describe, expect, it } from "vitest";

import { CONTRACT_SUITES, PENDING_SUITES } from "#/registry";

describe("core-contract registry", () => {
  it("every member without a suite is listed in PENDING_SUITES, and nothing else is", () => {
    const pending = Object.entries(CONTRACT_SUITES)
      .filter(([, suite]) => {
        return suite === null;
      })
      .map(([member]) => {
        return member;
      })
      .sort();
    expect(pending).toEqual([...PENDING_SUITES].sort());
  });

  it("slice 1a members have suites", () => {
    for (const member of [
      "presenters.connection",
      "presenters.themePreference",
      "presenters.themeSkinPreference",
      "presenters.viewModePreference",
      "presenters.powerSaver",
      "commands.reconnect",
    ] as const) {
      expect(CONTRACT_SUITES[member]).not.toBeNull();
    }
  });
});
