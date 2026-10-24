import { describe, expect, it } from "vitest";

import type { AccountListState } from "@rtc/core-api";
import type { AccountStatus, AccountSummary } from "@rtc/domain";

import {
  ACCOUNT_LIST_LOADING,
  countPending,
  foldAccountList,
  orderAccountRows,
} from "#/presenters/accountListFold";

describe("orderAccountRows", () => {
  it("puts pending rows first, oldest join first, then the rest newest first", () => {
    const rows = [
      createAccount("a", "active", 100),
      createAccount("p-new", "pending", 300),
      createAccount("b", "blocked", 200),
      createAccount("p-old", "pending", 50),
      createAccount("c", "active", 400),
    ];

    expect(ids(orderAccountRows(rows))).toEqual([
      "p-old",
      "p-new",
      "c",
      "b",
      "a",
    ]);
  });

  it("breaks ties by id in both groups", () => {
    const rows = [
      createAccount("z", "pending", 10),
      createAccount("m", "pending", 10),
      createAccount("y", "active", 20),
      createAccount("b", "active", 20),
    ];

    expect(ids(orderAccountRows(rows))).toEqual(["m", "z", "b", "y"]);
  });

  it("does not mutate its input", () => {
    const rows = [
      createAccount("a", "active", 1),
      createAccount("b", "pending", 2),
    ];
    orderAccountRows(rows);

    expect(ids(rows)).toEqual(["a", "b"]);
  });
});

describe("countPending", () => {
  it("counts pending rows only: unconfirmed, active and blocked do not count", () => {
    const rows = [
      createAccount("a", "pending", 1),
      createAccount("b", "unconfirmed", 2),
      createAccount("c", "active", 3),
      createAccount("d", "blocked", 4),
      createAccount("e", "pending", 5),
    ];

    expect(countPending(rows)).toBe(2);
  });
});

describe("foldAccountList", () => {
  it("ok gives ready with the ordered rows and the pending count", () => {
    const rows = [
      createAccount("a", "active", 1),
      createAccount("b", "pending", 2),
    ];

    expect(
      foldAccountList({ ok: true, accounts: rows }, ACCOUNT_LIST_LOADING),
    ).toEqual({
      status: "ready",
      rows: [rows[1], rows[0]],
      pendingCount: 1,
    });
  });

  it("forbidden gives forbidden with no rows, even after rows were shown", () => {
    const previous = createReady([createAccount("a", "pending", 1)]);

    expect(
      foldAccountList({ ok: false, reason: "forbidden" }, previous),
    ).toEqual({ status: "forbidden", rows: [], pendingCount: 0 });
  });

  it.each(["self", "not_found", "invalid_name", "unavailable"] as const)(
    "a %s refusal gives failed and keeps the previous rows",
    (reason) => {
      const previous = createReady([createAccount("a", "pending", 1)]);

      expect(foldAccountList({ ok: false, reason }, previous)).toEqual({
        status: "failed",
        rows: previous.rows,
        pendingCount: 1,
      });
    },
  );

  it("the loading seed has no rows", () => {
    expect(ACCOUNT_LIST_LOADING).toEqual({
      status: "loading",
      rows: [],
      pendingCount: 0,
    });
  });
});

function ids(rows: readonly AccountSummary[]): readonly string[] {
  return rows.map((row) => {
    return row.id;
  });
}

function createReady(rows: readonly AccountSummary[]): AccountListState {
  return { status: "ready", rows, pendingCount: countPending(rows) };
}

function createAccount(
  id: string,
  status: AccountStatus,
  joinedAt: number,
): AccountSummary {
  return {
    id,
    email: `${id}@desk.io`,
    displayName: `Name ${id}`,
    access: "user",
    status,
    joinedAt,
    isSelf: false,
  };
}
