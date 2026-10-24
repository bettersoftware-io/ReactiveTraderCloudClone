import { Observable } from "rxjs";

import type { IWsAdapter } from "@rtc/core-api";
import type {
  AccountActionOutcome,
  AccountAdminAction,
  AccountAdminPort,
  AccountListOutcome,
} from "@rtc/domain";
import {
  type AccountIdPayload,
  type AccountRenamePayload,
  CLIENT_MSG,
  isAccountAdminAnswerDto,
  type RpcResponse,
} from "@rtc/shared";

const UNAVAILABLE = { ok: false, reason: "unavailable" } as const;

/** One cold rpc per subscription. A nack, a malformed answer or a failed call
 * (a disconnect included) is a typed `unavailable` answer, never an error. */
function callAdmin<T>(
  ws: IWsAdapter,
  type: string,
  payload: AccountIdPayload | AccountRenamePayload | undefined,
  readAnswer: (answer: unknown) => T,
  unavailable: T,
): Observable<T> {
  return new Observable<T>((subscriber) => {
    let cancelled = false;

    void (async () => {
      let outcome: T;

      try {
        const resp = (await ws.rpc(type, payload)) as RpcResponse<unknown>;
        outcome = resp.type === "nack" ? unavailable : readAnswer(resp.payload);
      } catch {
        outcome = unavailable;
      }

      if (cancelled) {
        return;
      }

      subscriber.next(outcome);
      subscriber.complete();
    })();

    return (): void => {
      cancelled = true;
    };
  });
}

function readListAnswer(answer: unknown): AccountListOutcome {
  if (!isAccountAdminAnswerDto(answer)) {
    return UNAVAILABLE;
  }

  if ("accounts" in answer) {
    return {
      ok: true,
      accounts: answer.accounts.map((account) => {
        return {
          id: account.id,
          email: account.email,
          displayName: account.displayName,
          access: account.access,
          status: account.status,
          joinedAt: account.joinedAt,
          isSelf: account.isSelf,
        };
      }),
    };
  }

  if ("error" in answer) {
    return { ok: false, reason: answer.error };
  }

  return UNAVAILABLE;
}

function readActionAnswer(answer: unknown): AccountActionOutcome {
  if (!isAccountAdminAnswerDto(answer)) {
    return UNAVAILABLE;
  }

  if ("done" in answer) {
    return { ok: true };
  }

  if ("error" in answer) {
    return { ok: false, reason: answer.error };
  }

  return UNAVAILABLE;
}

interface ActionFrame {
  readonly type: string;
  readonly payload: AccountIdPayload | AccountRenamePayload;
}

function describeAction(
  accountId: string,
  action: AccountAdminAction,
): ActionFrame {
  switch (action.kind) {
    case "approve":
      return {
        type: CLIENT_MSG.ADMIN_ACCOUNTS_APPROVE,
        payload: { accountId },
      };
    case "block":
      return { type: CLIENT_MSG.ADMIN_ACCOUNTS_BLOCK, payload: { accountId } };
    case "unblock":
      return {
        type: CLIENT_MSG.ADMIN_ACCOUNTS_UNBLOCK,
        payload: { accountId },
      };
    case "rename":
      return {
        type: CLIENT_MSG.ADMIN_ACCOUNTS_RENAME,
        payload: { accountId, displayName: action.displayName },
      };
    case "delete":
      return { type: CLIENT_MSG.ADMIN_ACCOUNTS_DELETE, payload: { accountId } };
  }
}

/** Wire-mode `AccountAdminPort`: the administrator's account list and the five
 * actions over the live socket. */
export function createWsAccountAdminAdapter(ws: IWsAdapter): AccountAdminPort {
  return {
    listAccounts(): Observable<AccountListOutcome> {
      return callAdmin(
        ws,
        CLIENT_MSG.ADMIN_ACCOUNTS_LIST,
        undefined,
        readListAnswer,
        UNAVAILABLE,
      );
    },
    actOn(
      accountId: string,
      action: AccountAdminAction,
    ): Observable<AccountActionOutcome> {
      const { type, payload } = describeAction(accountId, action);

      return callAdmin(ws, type, payload, readActionAnswer, UNAVAILABLE);
    },
  };
}
