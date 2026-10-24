import { type Observable, of } from "rxjs";

import type { AccessLevel } from "../auth/accessLevel.js";
import type { AccountStatus } from "../auth/accountStatus.js";

export interface AccountSummary {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly access: AccessLevel;
  readonly status: AccountStatus;
  /** Epoch ms. */
  readonly joinedAt: number;
  /** True for the administrator's own row. */
  readonly isSelf: boolean;
}

export type AccountAdminRefusal =
  | "forbidden"
  | "self"
  | "not_found"
  | "invalid_name"
  | "unavailable";

export type AccountAdminAction =
  | { readonly kind: "approve" }
  | { readonly kind: "block" }
  | { readonly kind: "unblock" }
  | { readonly kind: "rename"; readonly displayName: string }
  | { readonly kind: "delete" };

export type AccountListOutcome =
  | { readonly ok: true; readonly accounts: readonly AccountSummary[] }
  | { readonly ok: false; readonly reason: AccountAdminRefusal };

export type AccountActionOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: AccountAdminRefusal };

export interface AccountAdminPort {
  listAccounts(): Observable<AccountListOutcome>;
  actOn(
    accountId: string,
    action: AccountAdminAction,
  ): Observable<AccountActionOutcome>;
}

/** The port of a transport that has no account directory: every call answers
 * `unavailable` once and completes. */
export function createUnavailableAccountAdmin(): AccountAdminPort {
  return {
    listAccounts: (): Observable<AccountListOutcome> => {
      return of({ ok: false, reason: "unavailable" });
    },
    actOn: (): Observable<AccountActionOutcome> => {
      return of({ ok: false, reason: "unavailable" });
    },
  };
}
