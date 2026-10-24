import { describe, expect, it } from "vitest";

import type { AccountActionState } from "@rtc/core-api";
import type { AccountActionOutcome } from "@rtc/domain";

import { DISPLAY_NAME_INPUT_ERROR } from "#/presenters/accountAccessCopy";
import {
  ACCOUNT_ACTION_IDLE,
  type AccountActionEvent,
  refreshesAccountList,
  stepAccountAction,
} from "#/presenters/accountActionFold";
import { describeAccountAdminRefusal } from "#/presenters/accountAdminCopy";

describe("stepAccountAction", () => {
  it.each([["approve"], ["block"], ["unblock"]] as const)(
    "%s goes from idle to inFlight and sends that action",
    (kind) => {
      expect(stepAccountAction(ACCOUNT_ACTION_IDLE, { type: kind })).toEqual({
        state: { phase: "inFlight", action: kind },
        request: { kind },
      });
    },
  );

  it("requestDelete goes idle -> confirmingDelete with nothing sent; confirmDelete then sends delete", () => {
    const asking = stepAccountAction(ACCOUNT_ACTION_IDLE, {
      type: "requestDelete",
    });
    expect(asking).toEqual({
      state: { phase: "confirmingDelete" },
      request: null,
    });
    expect(stepAccountAction(asking.state, { type: "confirmDelete" })).toEqual({
      state: { phase: "inFlight", action: "delete" },
      request: { kind: "delete" },
    });
  });

  it("confirmDelete without a request, and cancel from confirmingDelete, send nothing", () => {
    expect(
      stepAccountAction(ACCOUNT_ACTION_IDLE, { type: "confirmDelete" }),
    ).toEqual({ state: ACCOUNT_ACTION_IDLE, request: null });
    expect(
      stepAccountAction({ phase: "confirmingDelete" }, { type: "cancel" }),
    ).toEqual({ state: ACCOUNT_ACTION_IDLE, request: null });
  });

  it("startRename seeds the draft with the current name and no error", () => {
    expect(
      stepAccountAction(ACCOUNT_ACTION_IDLE, {
        type: "startRename",
        current: "Ann",
      }),
    ).toEqual({
      state: { phase: "renaming", draft: "Ann", draftError: null },
      request: null,
    });
  });

  it("editName keeps the draft as typed and carries the display-name check's text, or null", () => {
    const renaming: AccountActionState = {
      phase: "renaming",
      draft: "Ann",
      draftError: null,
    };

    expect(
      stepAccountAction(renaming, { type: "editName", draft: "A" }).state,
    ).toEqual({
      phase: "renaming",
      draft: "A",
      draftError: DISPLAY_NAME_INPUT_ERROR,
    });
    expect(
      stepAccountAction(renaming, { type: "editName", draft: "  Anna  " })
        .state,
    ).toEqual({ phase: "renaming", draft: "  Anna  ", draftError: null });
  });

  it("submitRename with an invalid draft stays put with the error and sends nothing", () => {
    const step = stepAccountAction(
      { phase: "renaming", draft: "x", draftError: null },
      { type: "submitRename" },
    );

    expect(step).toEqual({
      state: {
        phase: "renaming",
        draft: "x",
        draftError: DISPLAY_NAME_INPUT_ERROR,
      },
      request: null,
    });
  });

  it("submitRename with a valid draft goes to inFlight(rename) carrying the normalized name", () => {
    const step = stepAccountAction(
      { phase: "renaming", draft: "  Anna   Lee ", draftError: null },
      { type: "submitRename" },
    );

    expect(step.state).toEqual({ phase: "inFlight", action: "rename" });
    expect(step.request).toEqual({ kind: "rename", displayName: "Anna Lee" });
  });

  it("cancel from renaming goes back to idle", () => {
    expect(
      stepAccountAction(
        { phase: "renaming", draft: "Ann", draftError: null },
        { type: "cancel" },
      ),
    ).toEqual({ state: ACCOUNT_ACTION_IDLE, request: null });
  });

  it("settled ok goes to idle", () => {
    expect(stepAccountAction(IN_FLIGHT_APPROVE, settled({ ok: true }))).toEqual(
      { state: ACCOUNT_ACTION_IDLE, request: null },
    );
  });

  it("settled refused goes to failed carrying the refusal's text, for the action that ran", () => {
    expect(
      stepAccountAction(
        { phase: "inFlight", action: "delete" },
        settled({ ok: false, reason: "not_found" }),
      ),
    ).toEqual({
      state: {
        phase: "failed",
        action: "delete",
        message: describeAccountAdminRefusal("not_found", "delete"),
      },
      request: null,
    });
  });

  it("dismiss goes from failed back to idle", () => {
    expect(
      stepAccountAction(
        { phase: "failed", action: "block", message: "x" },
        { type: "dismiss" },
      ),
    ).toEqual({ state: ACCOUNT_ACTION_IDLE, request: null });
  });

  it("a settled outside inFlight is ignored (a late answer after cancel or dispose)", () => {
    for (const state of [
      ACCOUNT_ACTION_IDLE,
      { phase: "confirmingDelete" },
      { phase: "renaming", draft: "Ann", draftError: null },
      { phase: "failed", action: "block", message: "x" },
    ] as const) {
      expect(stepAccountAction(state, settled({ ok: true }))).toEqual({
        state,
        request: null,
      });
    }
  });

  it("intents a phase does not list are ignored", () => {
    const ignored: readonly [AccountActionState, AccountActionEvent][] = [
      [IN_FLIGHT_APPROVE, { type: "block" }],
      [IN_FLIGHT_APPROVE, { type: "cancel" }],
      [IN_FLIGHT_APPROVE, { type: "dismiss" }],
      [{ phase: "confirmingDelete" }, { type: "approve" }],
      [{ phase: "confirmingDelete" }, { type: "dismiss" }],
      [
        { phase: "renaming", draft: "Ann", draftError: null },
        { type: "requestDelete" },
      ],
      [
        { phase: "renaming", draft: "Ann", draftError: null },
        { type: "approve" },
      ],
      [{ phase: "failed", action: "block", message: "x" }, { type: "approve" }],
      [{ phase: "failed", action: "block", message: "x" }, { type: "cancel" }],
      [ACCOUNT_ACTION_IDLE, { type: "cancel" }],
      [ACCOUNT_ACTION_IDLE, { type: "dismiss" }],
      [ACCOUNT_ACTION_IDLE, { type: "submitRename" }],
      [ACCOUNT_ACTION_IDLE, { type: "editName", draft: "Ann" }],
    ];

    for (const [state, event] of ignored) {
      expect(stepAccountAction(state, event)).toEqual({
        state,
        request: null,
      });
    }
  });
});

describe("refreshesAccountList", () => {
  it("is true for success and for a forbidden refusal, false for any other refusal", () => {
    expect(refreshesAccountList({ ok: true })).toBe(true);
    expect(refreshesAccountList({ ok: false, reason: "forbidden" })).toBe(true);
    expect(refreshesAccountList({ ok: false, reason: "self" })).toBe(false);
    expect(refreshesAccountList({ ok: false, reason: "not_found" })).toBe(
      false,
    );
    expect(refreshesAccountList({ ok: false, reason: "unavailable" })).toBe(
      false,
    );
  });
});

function settled(outcome: AccountActionOutcome): AccountActionEvent {
  return { type: "settled", outcome };
}

const IN_FLIGHT_APPROVE: AccountActionState = {
  phase: "inFlight",
  action: "approve",
};
