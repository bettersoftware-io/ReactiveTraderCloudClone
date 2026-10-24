import { describe, expect, it } from "vitest";

import type { AccountListState } from "@rtc/core-api";
import type { AccountStatus, AccountSummary } from "@rtc/domain";

import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

const LOADING: AccountListState = {
  status: "loading",
  rows: [],
  pendingCount: 0,
};

/** `accountList`: loads on its FIRST subscription (never at construction),
 * re-reads on `refresh()` with the rows still visible, and releases its port
 * stream at dispose. The row order and the pending count are spelled out
 * here, not imported — this package may not depend on `@rtc/core-logic`. */
export function describeAccountListContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("calls the port zero times at composition and until the first subscription, then once", async () => {
      const h = makeHarness();

      try {
        await settle();
        expect(h.driver.portCalls("accountAdmin.listAccounts")).toBe(0);
        expect(h.driver.pendingAccountLists()).toBe(0);

        const c = collect(h.app.presenters.accountList.state$);
        await settle();
        expect(c.values).toEqual([LOADING]);
        expect(h.driver.portCalls("accountAdmin.listAccounts")).toBe(1);
        expect(h.driver.pendingAccountLists()).toBe(1);

        const second = collect(h.app.presenters.accountList.state$);
        await settle();
        expect(h.driver.portCalls("accountAdmin.listAccounts")).toBe(1);
        second.unsubscribe();
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("is ready with the rows pending-first (oldest join first), then the rest newest first", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.accountList.state$);
        h.driver.emitAccountList({
          ok: true,
          accounts: [
            createAccount("a", "active", 100),
            createAccount("p2", "pending", 300),
            createAccount("b", "blocked", 200),
            createAccount("p1", "pending", 50),
          ],
        });
        await settle();
        const last = c.values.at(-1);
        expect(last?.status).toBe("ready");
        expect(
          last?.rows.map((row) => {
            return row.id;
          }),
        ).toEqual(["p1", "p2", "b", "a"]);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("counts only pending rows: unconfirmed rows are not pending", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.accountList.state$);
        h.driver.emitAccountList({
          ok: true,
          accounts: [
            createAccount("u", "unconfirmed", 1),
            createAccount("p", "pending", 2),
            createAccount("a", "active", 3),
          ],
        });
        await settle();
        expect(c.values.at(-1)?.pendingCount).toBe(1);
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("a late subscriber reads the current state and opens no second load", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.accountList.state$);
        h.driver.emitAccountList({
          ok: true,
          accounts: [createAccount("a", "active", 1)],
        });
        await settle();
        const late = collect(h.app.presenters.accountList.state$);
        expect(late.values).toEqual([c.values.at(-1)]);
        expect(h.driver.portCalls("accountAdmin.listAccounts")).toBe(1);
        late.unsubscribe();
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("refresh calls the port again and the rows stay visible while it loads", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.accountList.state$);
        const rows = [createAccount("p", "pending", 1)];
        h.driver.emitAccountList({ ok: true, accounts: rows });
        await settle();
        h.app.presenters.accountList.refresh();
        await settle();
        expect(h.driver.portCalls("accountAdmin.listAccounts")).toBe(2);
        expect(c.values.at(-1)).toEqual({
          status: "loading",
          rows,
          pendingCount: 1,
        });
        const next = [...rows, createAccount("q", "pending", 2)];
        h.driver.emitAccountList({ ok: true, accounts: next });
        await settle();
        expect(c.values.at(-1)).toEqual({
          status: "ready",
          rows: next,
          pendingCount: 2,
        });
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("forbidden is forbidden with no rows", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.accountList.state$);
        h.driver.emitAccountList({
          ok: true,
          accounts: [createAccount("p", "pending", 1)],
        });
        await settle();
        h.app.presenters.accountList.refresh();
        h.driver.emitAccountList({ ok: false, reason: "forbidden" });
        await settle();
        expect(c.values.at(-1)).toEqual({
          status: "forbidden",
          rows: [],
          pendingCount: 0,
        });
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("any other refusal is failed and keeps the rows", async () => {
      const h = makeHarness();

      try {
        const c = collect(h.app.presenters.accountList.state$);
        const rows = [createAccount("p", "pending", 1)];
        h.driver.emitAccountList({ ok: true, accounts: rows });
        await settle();
        h.app.presenters.accountList.refresh();
        h.driver.emitAccountList({ ok: false, reason: "unavailable" });
        await settle();
        expect(c.values.at(-1)).toEqual({
          status: "failed",
          rows,
          pendingCount: 1,
        });
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });

    it("dispose cuts the port stream still being held, and a stream first subscribed afterwards opens no port", async () => {
      const h = makeHarness();

      try {
        const held = collect(h.app.presenters.accountList.state$);
        await settle();
        expect(h.driver.pendingAccountLists()).toBe(1);
        await h.app.dispose();
        await settle();
        expect(h.driver.pendingAccountLists()).toBe(0);
        h.app.presenters.accountList.refresh();
        await settle();
        expect(h.driver.portCalls("accountAdmin.listAccounts")).toBe(1);
        held.unsubscribe();

        const late = collect(h.app.presenters.accountList.state$);
        await settle();
        expect(h.driver.portCalls("accountAdmin.listAccounts")).toBe(1);
        expect(h.driver.pendingAccountLists()).toBe(0);
        late.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
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
