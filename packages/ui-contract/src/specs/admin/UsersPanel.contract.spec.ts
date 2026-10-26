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
  ACCOUNT_ACTION_PROGRESS_LABELS,
  ACCOUNT_ADMIN_COPY,
  checkDisplayNameInput,
  describeAccountAdminRefusal,
  describePendingCount,
  describeRowActionLabel,
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

  it("names the row's account in each button's accessible name, keeping the visible label", () => {
    const panel = mount(UsersPanel, {
      accountList: {
        status: "ready",
        rows: [createAccount("a1", "pending"), createAccount("a2", "pending")],
      },
    });
    const a2Approve = describeRowActionLabel("approve", "Name a2");

    expect(panel.hasButtonNamed("a2", a2Approve)).toBe(true);
    expect(a2Approve).toContain("Name a2");
    expect(panel.hasButtonNamed("a1", a2Approve)).toBe(false);
    expect(
      panel.hasButtonNamed("a1", describeRowActionLabel("approve", "Name a1")),
    ).toBe(true);
    expect(panel.buttonLabel("a2", "approve")).toBe(ACCOUNT_ADMIN_COPY.approve);
  });

  it("names the account in the delete confirmation's buttons too", async () => {
    const panel = mount(UsersPanel, {
      accountList: {
        status: "ready",
        rows: [createAccount("a1", "active"), createAccount("a2", "active")],
      },
    });

    await panel.click("a2", "delete");

    expect(
      panel.hasButtonNamed("a2", describeRowActionLabel("confirm", "Name a2")),
    ).toBe(true);
    expect(
      panel.hasButtonNamed("a2", describeRowActionLabel("cancel", "Name a2")),
    ).toBe(true);
  });

  it("gives the email cell the full address as its hover title", () => {
    const panel = mount(UsersPanel, {
      accountList: {
        status: "ready",
        rows: [createAccount("a1", "active"), createAccount("a2", "active")],
      },
    });

    expect(panel.emailTitle("a2")).toBe("a2@example.test");
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

  it("puts the focus in the field Rename opens", async () => {
    const panel = mount(UsersPanel, {
      accountList: {
        status: "ready",
        rows: [createAccount("a1", "active"), createAccount("a2", "active")],
      },
    });

    await panel.click("a2", "rename");

    expect(panel.isNameInputFocused("a2")).toBe(true);
  });

  it("saves the rename on Enter", async () => {
    const panel = mount(UsersPanel, {
      accountList: {
        status: "ready",
        rows: [createAccount("a1", "active"), createAccount("a2", "active")],
      },
      accountActions: {
        a2: { phase: "renaming", draft: "Ann", draftError: null },
      },
    });

    await panel.pressNameKey("a2", "Enter");

    expect(panel.actionCalls()).toEqual([
      { accountId: "a2", intent: "submitRename" },
    ]);
  });

  it("cancels the rename on Escape", async () => {
    const panel = mount(UsersPanel, {
      accountList: {
        status: "ready",
        rows: [createAccount("a1", "active"), createAccount("a2", "active")],
      },
      accountActions: {
        a2: { phase: "renaming", draft: "Ann", draftError: null },
      },
    });

    await panel.pressNameKey("a2", "Escape");

    expect(panel.hasNameInput("a2")).toBe(false);
    expect(panel.actionCalls()).toEqual([
      { accountId: "a2", intent: "cancel" },
    ]);
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

describe("UsersPanel — focus returns to the button that opened a state", () => {
  it("returns focus to Rename after the rename's Cancel button", async () => {
    const panel = mount(UsersPanel, {
      accountList: { status: "ready", rows: createActivePair() },
    });

    await panel.click("a2", "rename");
    await panel.click("a2", "cancel");

    expect(panel.hasNameInput("a2")).toBe(false);
    expect(panel.isButtonFocused("a2", "rename")).toBe(true);
  });

  it("returns focus to Rename after Escape in the rename field", async () => {
    const panel = mount(UsersPanel, {
      accountList: { status: "ready", rows: createActivePair() },
    });

    await panel.click("a2", "rename");
    await panel.pressNameKey("a2", "Escape");

    expect(panel.isButtonFocused("a2", "rename")).toBe(true);
  });

  it("returns focus to Rename only once the save has settled and the button is enabled", async () => {
    const panel = mount(UsersPanel, {
      accountList: { status: "ready", rows: createActivePair() },
    });

    await panel.click("a2", "rename");
    await panel.click("a2", "save");

    expect(panel.rowPhase("a2")).toBe("inFlight");
    expect(panel.isButtonFocused("a2", "rename")).toBe(false);

    panel.setAccountAction("a2", { phase: "idle" });

    expect(panel.isButtonFocused("a2", "rename")).toBe(true);
  });

  it("returns focus to Rename after Enter saves and the save settles", async () => {
    const panel = mount(UsersPanel, {
      accountList: { status: "ready", rows: createActivePair() },
    });

    await panel.click("a2", "rename");
    await panel.pressNameKey("a2", "Enter");
    panel.setAccountAction("a2", { phase: "idle" });

    expect(panel.isButtonFocused("a2", "rename")).toBe(true);
  });

  it("keeps focus off the buttons while a failed save waits to be dismissed", async () => {
    const panel = mount(UsersPanel, {
      accountList: { status: "ready", rows: createActivePair() },
    });

    await panel.click("a2", "rename");
    await panel.click("a2", "save");
    panel.setAccountAction("a2", {
      phase: "failed",
      action: "rename",
      message: "Could not rename",
    });

    expect(panel.isButtonFocused("a2", "rename")).toBe(false);

    await panel.click("a2", "dismiss");

    expect(panel.isButtonFocused("a2", "rename")).toBe(true);
  });

  it("returns focus to Delete after the delete confirmation's Cancel", async () => {
    const panel = mount(UsersPanel, {
      accountList: { status: "ready", rows: createActivePair() },
    });

    await panel.click("a2", "delete");
    await panel.click("a2", "cancel");

    expect(panel.isButtonFocused("a2", "delete")).toBe(true);
  });

  it("does not move focus when a confirmed delete is in flight", async () => {
    const panel = mount(UsersPanel, {
      accountList: { status: "ready", rows: createActivePair() },
    });

    await panel.click("a2", "delete");
    await panel.click("a2", "confirm-delete");
    panel.setAccountAction("a2", { phase: "idle" });

    expect(panel.isButtonFocused("a2", "delete")).toBe(false);
  });

  it("does not take the focus on first render or when the list is re-emitted", async () => {
    const panel = mount(UsersPanel, {
      accountList: { status: "ready", rows: createActivePair() },
    });

    expect(panel.isFocusOnPage()).toBe(true);

    await panel.setAccountList({ rows: createActivePair() });

    expect(panel.isFocusOnPage()).toBe(true);
  });

  it("does not pull focus back from where the administrator moved while the save ran", async () => {
    const panel = mount(UsersPanel, {
      accountList: { status: "ready", rows: createActivePair() },
    });

    await panel.click("a2", "rename");
    await panel.click("a2", "save");
    panel.focusButton("a1", "rename");
    panel.setAccountAction("a2", { phase: "idle" });

    expect(panel.isButtonFocused("a1", "rename")).toBe(true);
    expect(panel.isButtonFocused("a2", "rename")).toBe(false);
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

  it("reads the chosen button in progress, and leaves the others' labels", () => {
    const panel = mount(UsersPanel, {
      accountList: {
        status: "ready",
        rows: [
          createAccount("a1", "pending"),
          createAccount("a2", "active"),
          createAccount("a3", "active"),
        ],
      },
      accountActions: {
        a2: { phase: "inFlight", action: "block" },
        a3: { phase: "inFlight", action: "delete" },
      },
    });

    expect(panel.buttonLabel("a2", "block")).toBe(
      ACCOUNT_ACTION_PROGRESS_LABELS.block,
    );
    expect(panel.buttonLabel("a2", "delete")).toBe(ACCOUNT_ADMIN_COPY.delete);
    expect(panel.buttonLabel("a3", "delete")).toBe(
      ACCOUNT_ACTION_PROGRESS_LABELS.delete,
    );
    expect(panel.buttonLabel("a3", "block")).toBe(ACCOUNT_ADMIN_COPY.block);
    expect(panel.buttonLabel("a1", "approve")).toBe(ACCOUNT_ADMIN_COPY.approve);
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

describe("UsersPanel — a re-emitted list keeps each row's action", () => {
  // Every list refresh hands over NEW row objects for the same accounts. A
  // row is its account's action machine's owner, so it must be keyed by the
  // account id: keyed by the object, a refresh would remount the row and
  // reset the machine (the world models that: a released row goes `idle`).
  it("keeps a row's request in flight across a re-emission of the list", async () => {
    const panel = mount(UsersPanel, {
      accountList: { status: "ready", rows: createPendingPair() },
      accountActions: { a2: { phase: "inFlight", action: "approve" } },
    });

    await panel.setAccountList({ rows: createPendingPair() });

    expect(panel.rowPhase("a2")).toBe("inFlight");
    expect(panel.areRowButtonsDisabled("a2")).toBe(true);
    expect(panel.buttonLabel("a2", "approve")).toBe(
      ACCOUNT_ACTION_PROGRESS_LABELS.approve,
    );
  });

  it("keeps a failed row's message and Dismiss across a re-emission", async () => {
    const message = describeAccountAdminRefusal("not_found", "approve");
    const panel = mount(UsersPanel, {
      accountList: { status: "ready", rows: createPendingPair() },
      accountActions: { a2: { phase: "failed", action: "approve", message } },
    });

    await panel.setAccountList({ rows: createPendingPair() });

    expect(panel.errorText("a2")).toBe(message);
    expect(panel.hasButton("a2", "dismiss")).toBe(true);
  });

  it("keeps a rename's draft across a re-emission", async () => {
    const panel = mount(UsersPanel, {
      accountList: { status: "ready", rows: createPendingPair() },
      accountActions: {
        a2: { phase: "renaming", draft: "Ann Lee", draftError: null },
      },
    });

    await panel.setAccountList({ rows: createPendingPair() });

    expect(panel.nameDraft("a2")).toBe("Ann Lee");
  });
});

describe("UsersPanel — loading and a failed re-read", () => {
  it("shows no rows and no pending count before the first answer", () => {
    const world = createWorld({ accountList: { status: "loading" } });
    const panel = mountWith(world, UsersPanel);
    const head = mountWith(world, UsersHead);

    expect(panel.status()).toBe("loading");
    expect(panel.rowIds()).toEqual([]);
    expect(panel.isEmpty()).toBe(false);
    expect(head.pendingText()).toBeNull();
    expect(head.hasRefresh()).toBe(true);
  });

  it("keeps the rows already shown under the list-failure line", () => {
    const world = createWorld({
      accountList: {
        status: "failed",
        rows: [createAccount("a1", "pending"), createAccount("a2", "active")],
      },
    });
    const panel = mountWith(world, UsersPanel);
    const head = mountWith(world, UsersHead);

    expect(panel.status()).toBe("failed");
    expect(panel.failedText()).toBe(
      describeAccountAdminRefusal("unavailable", "list"),
    );
    expect(panel.rowIds()).toEqual(["a1", "a2"]);
    expect(head.pendingText()).toBe(describePendingCount(1));
  });

  it("shows no failure line on a list that read", () => {
    const panel = mount(UsersPanel, {
      accountList: { status: "ready", rows: [createAccount("a1", "active")] },
    });

    expect(panel.failedText()).toBeNull();
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

function createActivePair(): AccountSummary[] {
  return [createAccount("a1", "active"), createAccount("a2", "active")];
}

function createPendingPair(): AccountSummary[] {
  return [createAccount("a1", "pending"), createAccount("a2", "pending")];
}

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
