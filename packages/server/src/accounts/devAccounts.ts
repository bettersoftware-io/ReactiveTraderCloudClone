import type { AccessLevel, AccountStatus } from "@rtc/domain";

export interface DevAccountSeed {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly access: AccessLevel;
  readonly status: AccountStatus;
}

/** DEV ONLY, committed like the demo roster's `mcdc2026`. It can never work
 * on a deployed server: `resolveAccountsMode` refuses the in-memory
 * directory there. */
export const DEV_ACCOUNT_PASSWORD = "Mcdc2026!desk";

/** One account per status, so dev and e2e can exercise each without an
 * admin API. `.test` is a reserved TLD: these addresses can never exist. */
export const DEV_ACCOUNT_SEEDS: readonly DevAccountSeed[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    email: "admin@rtc.test",
    displayName: "Desk Admin",
    access: "admin",
    status: "active",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    email: "trader@rtc.test",
    displayName: "Guest Trader",
    access: "user",
    status: "active",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    email: "pending@rtc.test",
    displayName: "Pending Guest",
    access: "user",
    status: "pending",
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    email: "blocked@rtc.test",
    displayName: "Blocked Guest",
    access: "user",
    status: "blocked",
  },
];
