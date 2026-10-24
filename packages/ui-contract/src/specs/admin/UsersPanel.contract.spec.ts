/**
 * UsersPanel and UsersHead contract spec (B2c Task 13).
 *
 * The Admin tab's account list: one row per account in the order the
 * presenter hands over, the actions each status offers, the inline delete
 * confirmation and rename field, the in-flight and failed rows, and the
 * empty and forbidden states. Every line of copy comes from
 * `ACCOUNT_ADMIN_COPY` / `describeAccountAdminRefusal`, so the two clients
 * cannot spell it differently. The date a row joined is a presenter
 * formatting concern and is not asserted here.
 */

import { UsersHead, UsersPanel } from "@ui-contract/components";
import {
  cleanupMounted,
  createWorld,
  mount,
  mountWith,
} from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import {
  ACCOUNT_ADMIN_COPY,
  checkDisplayNameInput,
  describeAccountAdminRefusal,
  describePendingCount,
} from "@rtc/core-logic";
import type { AccountStatus, AccountSummary } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

describe("UsersPanel — the list", () => {
  it("renders the rows in the order given, and the head shows the pending count", () => {
    const rows = [
      createAccount("a1", "pending"),
      createAccount("a2", "pending"),
      createAccount("a3", "active"),
    ];
    const world = createWorld({ accountList: { status: "ready", rows } });
    const panel = mountWith(world, UsersPanel);
    const head = mountWith(world, UsersHead);

    expect(panel.status()).toBe("ready");
    expect(panel.rowIds()).toEqual(["a1", "a2", "a3"]);
    expect(head.pendingText()).toBe("2 pending");
    expect(head.pendingText()).toBe(describePendingCount(2));
  });

  it("does not count an unconfirmed account as pending, and offers it no Approve", () => {
    const rows = [
      createAccount("a1", "unconfirmed"),
      createAccount("a2", "pending"),
    ];
    const world = createWorld({ accountList: { status: "ready", rows } });
    const panel = mountWith(world, UsersPanel);
    const head = mountWith(world, UsersHead);

    expect(panel.rowStatus("a1")).toBe("unconfirmed");
    expect(panel.hasButton("a1", "approve")).toBe(false);
    expect(head.pendingText()).toBe(describePendingCount(1));
  });

  it("asks for a refresh from the head's Refresh control", async () => {
    const head = mount(UsersHead, {
      accountList: { status: "ready", rows: [createAccount("a1", "active")] },
    });

    expect(head.hasRefresh()).toBe(true);
    expect(head.refreshLabel()).toBe(ACCOUNT_ADMIN_COPY.refresh);

    await head.clickRefresh();

    expect(head.refreshCount()).toBe(1);
  });
});

describe("UsersPanel — the actions each status offers", () => {
  it("offers a pending row Approve, Rename and Delete, and wires Approve to its own id", async () => {
    const panel = mount(UsersPanel, {
      accountList: {
        status: "ready",
        rows: [createAccount("a1", "pending"), createAccount("a2", "pending")],
      },
    });

    expect(panel.hasButton("a2", "approve")).toBe(true);
    expect(panel.buttonLabel("a2", "approve")).toBe(ACCOUNT_ADMIN_COPY.approve);
    expect(panel.hasButton("a2", "rename")).toBe(true);
    expect(panel.buttonLabel("a2", "rename")).toBe(ACCOUNT_ADMIN_COPY.rename);
    expect(panel.hasButton("a2", "delete")).toBe(true);
    expect(panel.buttonLabel("a2", "delete")).toBe(ACCOUNT_ADMIN_COPY.delete);
    expect(panel.hasButton("a2", "block")).toBe(false);

    await panel.click("a2", "approve");

    expect(panel.actionCalls()).toEqual([
      { accountId: "a2", intent: "approve" },
    ]);
  });

  it("offers an active row Block, and a blocked row Unblock, each wired to its own id", async () => {
    const panel = mount(UsersPanel, {
      accountList: {
        status: "ready",
        rows: [
          createAccount("a1", "active"),
          createAccount("a2", "active"),
          createAccount("a3", "blocked"),
          createAccount("a4", "blocked"),
        ],
      },
    });

    expect(panel.hasButton("a2", "block")).toBe(true);
    expect(panel.buttonLabel("a2", "block")).toBe(ACCOUNT_ADMIN_COPY.block);
    expect(panel.hasButton("a2", "unblock")).toBe(false);
    expect(panel.hasButton("a4", "unblock")).toBe(true);
    expect(panel.buttonLabel("a4", "unblock")).toBe(ACCOUNT_ADMIN_COPY.unblock);
    expect(panel.hasButton("a4", "block")).toBe(false);

    await panel.click("a2", "block");
    await panel.click("a4", "unblock");

    expect(panel.actionCalls()).toEqual([
      { accountId: "a2", intent: "block" },
      { accountId: "a4", intent: "unblock" },
    ]);
  });

  it("shows the administrator's own row 'You' and no buttons", () => {
    const panel = mount(UsersPanel, {
      accountList: {
        status: "ready",
        rows: [{ ...createAccount("me", "active"), isSelf: true }],
      },
    });

    expect(panel.isSelf("me")).toBe(true);
    expect(panel.showsYou("me", ACCOUNT_ADMIN_COPY.you)).toBe(true);
    expect(panel.buttonIds("me")).toEqual([]);
  });
});

describe("UsersPanel — delete", () => {
  it("asks for confirmation inline on that row, and Cancel restores it", async () => {
    const panel = mount(UsersPanel, {
      accountList: {
        status: "ready",
        rows: [createAccount("a1", "active"), createAccount("a2", "active")],
      },
    });

    await panel.click("a2", "delete");

    expect(panel.hasButton("a2", "confirm-delete")).toBe(true);
    expect(panel.buttonLabel("a2", "confirm-delete")).toBe(
      ACCOUNT_ADMIN_COPY.confirm,
    );
    expect(panel.hasButton("a2", "cancel")).toBe(true);
    expect(panel.buttonLabel("a2", "cancel")).toBe(ACCOUNT_ADMIN_COPY.cancel);
    expect(panel.rowText("a2")).toContain(ACCOUNT_ADMIN_COPY.confirmDelete);
    expect(panel.hasButton("a2", "delete")).toBe(false);
    expect(panel.hasButton("a1", "confirm-delete")).toBe(false);
    expect(panel.hasButton("a1", "delete")).toBe(true);

    await panel.click("a2", "cancel");

    expect(panel.hasButton("a2", "delete")).toBe(true);
    expect(panel.hasButton("a2", "confirm-delete")).toBe(false);
    expect(panel.actionCalls()).toEqual([
      { accountId: "a2", intent: "requestDelete" },
      { accountId: "a2", intent: "cancel" },
    ]);
  });

  it("sends confirmDelete for that row only when Confirm is clicked", async () => {
    const panel = mount(UsersPanel, {
      accountList: {
        status: "ready",
        rows: [createAccount("a1", "active"), createAccount("a2", "active")],
      },
      accountActions: { a2: { phase: "confirmingDelete" } },
    });

    await panel.click("a2", "confirm-delete");

    expect(panel.actionCalls()).toEqual([
      { accountId: "a2", intent: "confirmDelete" },
    ]);
    expect(panel.hasButton("a1", "confirm-delete")).toBe(false);
  });
});

describe("UsersPanel — rename", () => {
  it("shows the field with the current name, and sends the edits and the save for that row", async () => {
    const panel = mount(UsersPanel, {
      accountList: {
        status: "ready",
        rows: [createAccount("a1", "active"), createAccount("a2", "active")],
      },
    });

    await panel.click("a2", "rename");

    expect(panel.hasNameInput("a2")).toBe(true);
    expect(panel.hasNameInput("a1")).toBe(false);
    expect(panel.nameDraft("a2")).toBe("Name a2");
    expect(panel.nameError("a2")).toBeNull();
    expect(panel.hasButton("a2", "save")).toBe(true);
    expect(panel.buttonLabel("a2", "save")).toBe(ACCOUNT_ADMIN_COPY.save);
    expect(panel.isButtonDisabled("a2", "save")).toBe(false);

    await panel.typeName("a2", "Ann Lee");
    await panel.click("a2", "save");

    const calls = panel.actionCalls();

    expect(calls[0]).toEqual({
      accountId: "a2",
      intent: "startRename",
      argument: "Name a2",
    });
    expect(calls.at(-2)).toEqual({
      accountId: "a2",
      intent: "editName",
      argument: "Ann Lee",
    });
    expect(calls.at(-1)).toEqual({ accountId: "a2", intent: "submitRename" });
    expect(
      calls.every((call) => {
        return call.accountId === "a2";
      }),
    ).toBe(true);
  });

  it("shows an invalid draft's error and disables Save", () => {
    const panel = mount(UsersPanel, {
      accountList: { status: "ready", rows: [createAccount("a1", "active")] },
      accountActions: {
        a1: { phase: "renaming", draft: "", draftError: "Too short" },
      },
    });

    expect(panel.nameError("a1")).toBe("Too short");
    expect(panel.isButtonDisabled("a1", "save")).toBe(true);
  });

  it("shows the error the live check gives an emptied draft", async () => {
    const check = checkDisplayNameInput("");
    const panel = mount(UsersPanel, {
      accountList: {
        status: "ready",
        rows: [createAccount("a1", "active"), createAccount("a2", "active")],
      },
    });

    await panel.click("a2", "rename");
    await panel.typeName("a2", "");

    expect(check.ok).toBe(false);
    expect(panel.nameError("a2")).toBe(check.ok ? null : check.error);
    expect(panel.isButtonDisabled("a2", "save")).toBe(true);
  });

  it("cancels a rename back to the row's actions", async () => {
    const panel = mount(UsersPanel, {
      accountList: {
        status: "ready",
        rows: [createAccount("a1", "active"), createAccount("a2", "active")],
      },
      accountActions: {
        a2: { phase: "renaming", draft: "Ann", draftError: null },
      },
    });

    await panel.click("a2", "cancel");

    expect(panel.hasNameInput("a2")).toBe(false);
    expect(panel.hasButton("a2", "rename")).toBe(true);
    expect(panel.actionCalls()).toEqual([
      { accountId: "a2", intent: "cancel" },
    ]);
  });
});

describe("UsersPanel — a request in flight, and a failure", () => {
  it("disables only the in-flight row's buttons", () => {
    const panel = mount(UsersPanel, {
      accountList: {
        status: "ready",
        rows: [createAccount("a1", "pending"), createAccount("a2", "pending")],
      },
      accountActions: { a1: { phase: "inFlight", action: "approve" } },
    });

    expect(panel.areRowButtonsDisabled("a1")).toBe(true);
    expect(panel.hasButton("a2", "approve")).toBe(true);
    expect(panel.isButtonDisabled("a2", "approve")).toBe(false);
    expect(panel.isButtonDisabled("a2", "delete")).toBe(false);
  });

  it("shows a failed row's message with Dismiss, and Dismiss clears it", async () => {
    const message = describeAccountAdminRefusal("not_found", "approve");
    const panel = mount(UsersPanel, {
      accountList: {
        status: "ready",
        rows: [createAccount("a1", "pending"), createAccount("a2", "pending")],
      },
      accountActions: { a2: { phase: "failed", action: "approve", message } },
    });

    expect(panel.errorText("a2")).toBe(message);
    expect(panel.errorText("a1")).toBeNull();
    expect(panel.hasButton("a2", "dismiss")).toBe(true);
    expect(panel.buttonLabel("a2", "dismiss")).toBe(ACCOUNT_ADMIN_COPY.dismiss);

    await panel.click("a2", "dismiss");

    expect(panel.errorText("a2")).toBeNull();
    expect(panel.actionCalls()).toEqual([
      { accountId: "a2", intent: "dismiss" },
    ]);
  });
});

describe("UsersPanel — empty and forbidden", () => {
  it("shows the empty copy for a ready list with no accounts", () => {
    const panel = mount(UsersPanel, { accountList: { status: "ready" } });

    expect(panel.isEmpty()).toBe(true);
    expect(panel.emptyText()).toBe(ACCOUNT_ADMIN_COPY.empty);
    expect(panel.isForbidden()).toBe(false);
  });

  it("shows the forbidden copy, and no rows, when the list is forbidden", () => {
    const panel = mount(UsersPanel, { accountList: { status: "forbidden" } });

    expect(panel.status()).toBe("forbidden");
    expect(panel.isForbidden()).toBe(true);
    expect(panel.forbiddenText()).toBe(ACCOUNT_ADMIN_COPY.forbidden);
    expect(panel.isEmpty()).toBe(false);
    expect(panel.rowIds()).toEqual([]);
  });

  it("leaves the empty state when an account arrives", () => {
    const panel = mount(UsersPanel, { accountList: { status: "ready" } });

    panel.setAccountList({ rows: [createAccount("a1", "active")] });

    expect(panel.isEmpty()).toBe(false);
    expect(panel.rowIds()).toEqual(["a1"]);
  });
});

function createAccount(id: string, status: AccountStatus): AccountSummary {
  return {
    id,
    email: `${id}@example.test`,
    displayName: `Name ${id}`,
    access: "user",
    status,
    joinedAt: 1_700_000_000_000,
    isSelf: false,
  };
}
