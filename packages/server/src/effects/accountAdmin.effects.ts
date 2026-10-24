import { from, type Observable } from "rxjs";

import type { AccountAdminAction } from "@rtc/domain";
import {
  type AccountAdminAnswerDto,
  CLIENT_MSG,
  isAccountIdPayload,
  isAccountRenamePayload,
  SERVER_MSG,
} from "@rtc/shared";
import { rpc, type WsEffect } from "@rtc/ws-effects";

import type { AdminAnswer } from "../accounts/accountAdminService.js";
import type { Ctx } from "./context.js";
import { validated } from "./guards.js";

function answerOf(answer: AdminAnswer<void>): AccountAdminAnswerDto {
  return answer.ok ? { done: true } : { error: answer.refusal };
}

const list$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.ADMIN_ACCOUNTS_LIST,
  SERVER_MSG.ADMIN_ACCOUNTS_LIST_RESPONSE,
  (_payload, ctx): Observable<AccountAdminAnswerDto> => {
    return from(
      ctx.accountAdmin
        .list(ctx.caller)
        .then((answer): AccountAdminAnswerDto => {
          return answer.ok
            ? { accounts: answer.value }
            : { error: answer.refusal };
        }),
    );
  },
);

function actionEffect(
  request: string,
  response: string,
  action: AccountAdminAction,
): WsEffect<Ctx> {
  return rpc(
    request,
    response,
    (payload, ctx): Observable<AccountAdminAnswerDto> => {
      return validated(
        request,
        payload,
        isAccountIdPayload,
        ({ accountId }): Observable<AccountAdminAnswerDto> => {
          return from(
            ctx.accountAdmin.act(ctx.caller, accountId, action).then(answerOf),
          );
        },
      );
    },
  );
}

const rename$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.ADMIN_ACCOUNTS_RENAME,
  SERVER_MSG.ADMIN_ACCOUNTS_RENAME_RESPONSE,
  (payload, ctx): Observable<AccountAdminAnswerDto> => {
    return validated(
      CLIENT_MSG.ADMIN_ACCOUNTS_RENAME,
      payload,
      isAccountRenamePayload,
      ({ accountId, displayName }): Observable<AccountAdminAnswerDto> => {
        return from(
          ctx.accountAdmin
            .act(ctx.caller, accountId, { kind: "rename", displayName })
            .then(answerOf),
        );
      },
    );
  },
);

export const accountAdminEffects: WsEffect<Ctx>[] = [
  list$,
  actionEffect(
    CLIENT_MSG.ADMIN_ACCOUNTS_APPROVE,
    SERVER_MSG.ADMIN_ACCOUNTS_APPROVE_RESPONSE,
    { kind: "approve" },
  ),
  actionEffect(
    CLIENT_MSG.ADMIN_ACCOUNTS_BLOCK,
    SERVER_MSG.ADMIN_ACCOUNTS_BLOCK_RESPONSE,
    { kind: "block" },
  ),
  actionEffect(
    CLIENT_MSG.ADMIN_ACCOUNTS_UNBLOCK,
    SERVER_MSG.ADMIN_ACCOUNTS_UNBLOCK_RESPONSE,
    { kind: "unblock" },
  ),
  rename$,
  actionEffect(
    CLIENT_MSG.ADMIN_ACCOUNTS_DELETE,
    SERVER_MSG.ADMIN_ACCOUNTS_DELETE_RESPONSE,
    { kind: "delete" },
  ),
];
