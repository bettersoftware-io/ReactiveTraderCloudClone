import { describe, expect, it } from "vitest";

import type { AccountActionState } from "@rtc/core-api";

import { createAdminSeed } from "#/harness/adminSession";
import { collect } from "#/harness/collect";
import type { MakeHarness } from "#/harness/harness";
import { settle } from "#/harness/settle";

// The copy is spelled out here, not imported: this package may not depend
// on @rtc/core-logic, and a suite that read the strings from the code under
// test would not notice them change.
const DISPLAY_NAME_INPUT_ERROR =
  "Display name: 2 to 40 characters, with at least one letter or digit";

const UNAVAILABLE_COPY =
  "The live desk is unavailable right now. Try again shortly";
const SELF_REFUSED = "You cannot change your own account";

const IDLE: AccountActionState = { phase: "idle" };

export function describeAccountActionContract(
  label: string,
  makeHarness: MakeHarness,
): void {
  describe(label, () => {
    it("starts idle synchronously and sends nothing", async () => {
      const h = makeHarness(createAdminSeed(0));
      const m = h.machines.accountAction("acc-1");

      try {
        const c = collect(m.state$);
        expect(c.values).toEqual([IDLE]);
        await settle();
        expect(h.driver.portCalls("accountAdmin.actOn")).toBe(0);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it.each([["approve"], ["block"], ["unblock"]] as const)(
      "%s is inFlight with exactly one actOn(id, action), and success returns to idle",
      async (kind) => {
        const h = makeHarness(createAdminSeed(0));
        const m = h.machines.accountAction("acc-1");

        try {
          const c = collect(m.state$);
          m.intents[kind]();
          await settle();
          expect(c.values.at(-1)).toEqual({ phase: "inFlight", action: kind });
          expect(h.driver.pendingAccountActions()).toEqual([
            { accountId: "acc-1", action: { kind } },
          ]);
          expect(h.driver.portCalls("accountAdmin.actOn")).toBe(1);
          m.intents[kind]();
          await settle();
          expect(h.driver.portCalls("accountAdmin.actOn")).toBe(1);
          h.driver.answerAction({ ok: true });
          await settle();
          expect(c.values.at(-1)).toEqual(IDLE);
          c.unsubscribe();
        } finally {
          m.dispose();
          await h.teardown();
        }
      },
    );

    it("a delete asks first: requestDelete sends nothing, cancel sends nothing, confirmDelete sends one delete", async () => {
      const h = makeHarness(createAdminSeed(0));
      const m = h.machines.accountAction("acc-2");

      try {
        const c = collect(m.state$);
        m.intents.requestDelete();
        await settle();
        expect(c.values.at(-1)).toEqual({ phase: "confirmingDelete" });
        expect(h.driver.portCalls("accountAdmin.actOn")).toBe(0);
        m.intents.cancel();
        await settle();
        expect(c.values.at(-1)).toEqual(IDLE);
        m.intents.confirmDelete();
        await settle();
        expect(c.values.at(-1)).toEqual(IDLE);
        expect(h.driver.portCalls("accountAdmin.actOn")).toBe(0);
        m.intents.requestDelete();
        m.intents.confirmDelete();
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "inFlight",
          action: "delete",
        });
        expect(h.driver.pendingAccountActions()).toEqual([
          { accountId: "acc-2", action: { kind: "delete" } },
        ]);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("a rename sends the NORMALIZED name; an invalid draft shows the live error and sends nothing", async () => {
      const h = makeHarness(createAdminSeed(0));
      const m = h.machines.accountAction("acc-3");

      try {
        const c = collect(m.state$);
        m.intents.startRename("Ann");
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "renaming",
          draft: "Ann",
          draftError: null,
        });
        m.intents.editName("x");
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "renaming",
          draft: "x",
          draftError: DISPLAY_NAME_INPUT_ERROR,
        });
        m.intents.submitRename();
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "renaming",
          draft: "x",
          draftError: DISPLAY_NAME_INPUT_ERROR,
        });
        expect(h.driver.portCalls("accountAdmin.actOn")).toBe(0);
        m.intents.editName("  Anna   Lee ");
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "renaming",
          draft: "  Anna   Lee ",
          draftError: null,
        });
        m.intents.submitRename();
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "inFlight",
          action: "rename",
        });
        expect(h.driver.pendingAccountActions()).toEqual([
          {
            accountId: "acc-3",
            action: { kind: "rename", displayName: "Anna Lee" },
          },
        ]);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("cancel leaves a rename without sending anything", async () => {
      const h = makeHarness(createAdminSeed(0));
      const m = h.machines.accountAction("acc-3");

      try {
        const c = collect(m.state$);
        m.intents.startRename("Ann");
        m.intents.cancel();
        await settle();
        expect(c.values.at(-1)).toEqual(IDLE);
        expect(h.driver.portCalls("accountAdmin.actOn")).toBe(0);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("success triggers exactly one list re-read", async () => {
      const h = makeHarness(createAdminSeed(0));
      const m = h.machines.accountAction("acc-1");

      try {
        const list = collect(h.app.presenters.accountList.state$);
        h.driver.emitAccountList({ ok: true, accounts: [] });
        await settle();
        expect(h.driver.portCalls("accountAdmin.listAccounts")).toBe(1);
        m.intents.approve();
        await settle();
        h.driver.answerAction({ ok: true });
        await settle();
        expect(h.driver.portCalls("accountAdmin.listAccounts")).toBe(2);
        expect(h.driver.pendingAccountLists()).toBe(1);
        list.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("a refusal is failed with its text until dismissed, and does not re-read the list", async () => {
      const h = makeHarness(createAdminSeed(0));
      const m = h.machines.accountAction("acc-1");

      try {
        const c = collect(m.state$);
        const list = collect(h.app.presenters.accountList.state$);
        h.driver.emitAccountList({ ok: true, accounts: [] });
        await settle();
        m.intents.block();
        await settle();
        h.driver.answerAction({ ok: false, reason: "self" });
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "failed",
          action: "block",
          message: SELF_REFUSED,
        });
        expect(h.driver.portCalls("accountAdmin.listAccounts")).toBe(1);
        m.intents.approve();
        await settle();
        expect(h.driver.portCalls("accountAdmin.actOn")).toBe(1);
        m.intents.dismiss();
        await settle();
        expect(c.values.at(-1)).toEqual(IDLE);
        list.unsubscribe();
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("a forbidden refusal flips the list to forbidden", async () => {
      const h = makeHarness(createAdminSeed(0));
      const m = h.machines.accountAction("acc-1");

      try {
        const list = collect(h.app.presenters.accountList.state$);
        h.driver.emitAccountList({
          ok: true,
          accounts: [],
        });
        await settle();
        m.intents.unblock();
        await settle();
        h.driver.answerAction({ ok: false, reason: "forbidden" });
        await settle();
        expect(h.driver.portCalls("accountAdmin.listAccounts")).toBe(2);
        h.driver.emitAccountList({ ok: false, reason: "forbidden" });
        await settle();
        expect(list.values.at(-1)).toEqual({
          status: "forbidden",
          rows: [],
          pendingCount: 0,
        });
        list.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("a port that errors reads as failed with the unavailable copy", async () => {
      const h = makeHarness(createAdminSeed(0));
      const m = h.machines.accountAction("acc-1");

      try {
        const c = collect(m.state$);
        m.intents.approve();
        await settle();
        h.driver.failAction(new Error("socket closed"));
        await settle();
        expect(c.values.at(-1)).toEqual({
          phase: "failed",
          action: "approve",
          message: UNAVAILABLE_COPY,
        });
        expect(c.errors).toEqual([]);
        m.intents.dismiss();
        await settle();
        expect(c.values.at(-1)).toEqual(IDLE);
        c.unsubscribe();
      } finally {
        m.dispose();
        await h.teardown();
      }
    });

    it("dispose in flight cancels the request: a later answer writes nothing and re-reads nothing", async () => {
      const h = makeHarness(createAdminSeed(0));
      const m = h.machines.accountAction("acc-1");

      try {
        const c = collect(m.state$);
        const list = collect(h.app.presenters.accountList.state$);
        h.driver.emitAccountList({ ok: true, accounts: [] });
        await settle();
        m.intents.approve();
        await settle();
        expect(h.driver.pendingAccountActions()).toHaveLength(1);
        const seen = c.values.length;
        m.dispose();
        await settle();
        expect(h.driver.pendingAccountActions()).toEqual([]);
        h.driver.answerAction({ ok: true });
        await settle();
        expect(c.values).toHaveLength(seen);
        expect(h.driver.portCalls("accountAdmin.listAccounts")).toBe(1);
        m.intents.block();
        await settle();
        expect(h.driver.portCalls("accountAdmin.actOn")).toBe(1);
        list.unsubscribe();
        c.unsubscribe();
      } finally {
        await h.teardown();
      }
    });
  });
}
