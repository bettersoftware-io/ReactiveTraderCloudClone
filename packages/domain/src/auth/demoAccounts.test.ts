import { describe, expect, it } from "vitest";

import { listDemoAccounts, sharedDemoPassword } from "./demoAccounts.js";

describe("listDemoAccounts", () => {
  it("lists each credentialed roster account with its password and role", () => {
    expect(listDemoAccounts({ astark: "pw-a", demo: "pw-d" })).toEqual([
      { username: "astark", password: "pw-a", role: "Senior FX Trader" },
      { username: "demo", password: "pw-d", role: "Read-Only Guest" },
    ]);
  });

  it("orders accounts by the roster, not by the credentials' key order", () => {
    const usernames = listDemoAccounts({
      demo: "pw",
      tchalla: "pw",
      astark: "pw",
    }).map((account) => {
      return account.username;
    });

    expect(usernames).toEqual(["astark", "tchalla", "demo"]);
  });

  it("leaves out a credential whose username is not on the roster", () => {
    expect(listDemoAccounts({ intruder: "pw", demo: "pw" })).toEqual([
      { username: "demo", password: "pw", role: "Read-Only Guest" },
    ]);
  });

  it("lists nothing when there are no credentials", () => {
    expect(listDemoAccounts({})).toEqual([]);
  });
});

describe("sharedDemoPassword", () => {
  it("is the password when every account shares it", () => {
    const accounts = listDemoAccounts({ astark: "same", demo: "same" });

    expect(sharedDemoPassword(accounts)).toBe("same");
  });

  it("is null when the accounts' passwords differ", () => {
    const accounts = listDemoAccounts({ astark: "one", demo: "other" });

    expect(sharedDemoPassword(accounts)).toBeNull();
  });

  it("is null when the shared password is empty — there is nothing to print", () => {
    const accounts = listDemoAccounts({ astark: "", demo: "" });

    expect(sharedDemoPassword(accounts)).toBeNull();
  });

  it("is null when no account is listed", () => {
    expect(sharedDemoPassword([])).toBeNull();
  });
});
