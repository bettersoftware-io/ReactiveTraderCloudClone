import { type StateObservable, state } from "@rx-state/core";
import {
  concat,
  defer,
  map,
  type Observable,
  of,
  Subject,
  shareReplay,
  startWith,
  switchMap,
  takeUntil,
} from "rxjs";
import { catchError, scan } from "rxjs/operators";

import type {
  AccountListPresenter as AccountListPresenterApi,
  AccountListState,
} from "@rtc/core-api";
import { ACCOUNT_LIST_LOADING, foldAccountList } from "@rtc/core-logic";
import type { AccountAdminPort, AccountListOutcome } from "@rtc/domain";

const UNAVAILABLE: AccountListOutcome = { ok: false, reason: "unavailable" };

/** A load starting (rows stay), or the answer to one. */
type ListStep =
  | { readonly kind: "loading" }
  | { readonly kind: "answered"; readonly outcome: AccountListOutcome };

const LOADING_STEP: ListStep = { kind: "loading" };

/** Implements `AccountListPresenter` (`@rtc/core-api`) — see the interface
 * for the contract. Nothing is read at construction: the first subscription
 * to `state$` opens the first load, `refresh()` supersedes any load in flight
 * with a new one (the rows already shown stay), and the held subscription is
 * warm for the session (`refCount: false`) and released by `disposed$`. */
export class AccountListPresenter implements AccountListPresenterApi {
  readonly state$: StateObservable<AccountListState>;

  readonly admin: AccountAdminPort;

  private readonly refreshes$ = new Subject<void>();

  constructor(port: AccountAdminPort, disposed$: Observable<unknown>) {
    this.admin = port;
    this.state$ = state(
      this.refreshes$.pipe(
        startWith(undefined),
        switchMap(() => {
          return concat(
            of(LOADING_STEP),
            defer(() => {
              return port.listAccounts();
            }).pipe(
              catchError((): Observable<AccountListOutcome> => {
                return of(UNAVAILABLE);
              }),
              map((outcome: AccountListOutcome): ListStep => {
                return { kind: "answered", outcome };
              }),
            ),
          );
        }),
        scan((previous: AccountListState, step: ListStep) => {
          return step.kind === "loading"
            ? { ...previous, status: "loading" as const }
            : foldAccountList(step.outcome, previous);
        }, ACCOUNT_LIST_LOADING),
        takeUntil(disposed$),
        shareReplay<AccountListState>({ bufferSize: 1, refCount: false }),
      ),
      ACCOUNT_LIST_LOADING,
    );
  }

  refresh(): void {
    this.refreshes$.next();
  }
}
