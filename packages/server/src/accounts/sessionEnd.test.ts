import { describe, expect, it } from "vitest";

import type { CachedAccount } from "#/accounts/accountStatusCache";
import { hasSessionEnded, type SessionEndVerdict } from "#/accounts/sessionEnd";

describe("hasSessionEnded", () => {
  const rows: readonly Row[] = [
    {
      name: "unavailable status",
      issuedAt: 100,
      account: { status: "unavailable" },
      ledger: null,
      expected: "unavailable",
    },
    {
      name: "unavailable beats a null issuedAt",
      issuedAt: null,
      account: { status: "unavailable" },
      ledger: null,
      expected: "unavailable",
    },
    {
      name: "missing account",
      issuedAt: 100,
      account: { status: "missing" },
      ledger: null,
      expected: "ended",
    },
    {
      name: "blocked account",
      issuedAt: 100,
      account: { status: "blocked", sessionsNotBefore: null },
      ledger: null,
      expected: "ended",
    },
    {
      name: "pending account",
      issuedAt: 100,
      account: { status: "pending", sessionsNotBefore: null },
      ledger: null,
      expected: "ended",
    },
    {
      name: "no iat",
      issuedAt: null,
      account: { status: "active", sessionsNotBefore: null },
      ledger: null,
      expected: "ended",
    },
    {
      name: "non-finite iat",
      issuedAt: Number.NaN,
      account: { status: "active", sessionsNotBefore: null },
      ledger: null,
      expected: "ended",
    },
    {
      name: "non-finite stamp",
      issuedAt: 100,
      account: { status: "active", sessionsNotBefore: Number.NaN },
      ledger: null,
      expected: "ended",
    },
    {
      name: "no stamps",
      issuedAt: 100,
      account: { status: "active", sessionsNotBefore: null },
      ledger: null,
      expected: "live",
    },
    {
      name: "issued at the stamp is live",
      issuedAt: 500,
      account: { status: "active", sessionsNotBefore: 500 },
      ledger: null,
      expected: "live",
    },
    {
      name: "issued one ms before the stamp has ended",
      issuedAt: 499,
      account: { status: "active", sessionsNotBefore: 500 },
      ledger: null,
      expected: "ended",
    },
    {
      name: "issued before the ledger stamp has ended",
      issuedAt: 499,
      account: { status: "active", sessionsNotBefore: null },
      ledger: 500,
      expected: "ended",
    },
    {
      name: "issued at the ledger stamp is live",
      issuedAt: 500,
      account: { status: "active", sessionsNotBefore: null },
      ledger: 500,
      expected: "live",
    },
    {
      name: "the later of the two stamps wins",
      issuedAt: 600,
      account: { status: "active", sessionsNotBefore: 500 },
      ledger: 700,
      expected: "ended",
    },
    {
      name: "the later of the two stamps wins (stamp later)",
      issuedAt: 600,
      account: { status: "active", sessionsNotBefore: 700 },
      ledger: 500,
      expected: "ended",
    },
    {
      name: "after both stamps",
      issuedAt: 800,
      account: { status: "active", sessionsNotBefore: 700 },
      ledger: 500,
      expected: "live",
    },
  ];

  it.each(rows)("$name -> $expected", (row) => {
    expect(hasSessionEnded(row.issuedAt, row.account, row.ledger)).toBe(
      row.expected,
    );
  });
});

interface Row {
  readonly name: string;
  readonly issuedAt: number | null;
  readonly account: CachedAccount;
  readonly ledger: number | null;
  readonly expected: SessionEndVerdict;
}
