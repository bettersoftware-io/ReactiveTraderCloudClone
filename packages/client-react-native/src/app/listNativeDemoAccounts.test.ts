import { expect, test, vi } from "vitest";

import { listNativeDemoAccounts } from "#/app/listNativeDemoAccounts";

test("simulator mode offers the roster, with the roles the screen prints", () => {
  expect(
    listNativeDemoAccounts(true).map((account) => {
      return account.username;
    }),
  ).toEqual(["astark", "nromanoff", "tchalla", "demo"]);
  expect(listNativeDemoAccounts(true)[0]?.password).toBe("mcdc2026");
});

// Those credentials are the server's; a hint here would advertise logins the
// app cannot vouch for.
test("a real server offers no demo accounts", () => {
  expect(listNativeDemoAccounts(false)).toEqual([]);
});

// `nativeAuthConfig` reads Expo's config at import; with none set it falls
// back to the four roster users.
vi.mock("expo-constants", () => {
  return { default: { expoConfig: { extra: {} } } };
});
