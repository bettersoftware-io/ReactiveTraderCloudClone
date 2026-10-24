import { type StateObservable, state } from "@rx-state/core";
import {
  BehaviorSubject,
  defer,
  distinctUntilChanged,
  Observable,
  of,
  type Subscription,
  take,
} from "rxjs";
import { catchError } from "rxjs/operators";

import type {
  AccountListPresenter as AccountListPresenterApi,
  AccountListState,
} from "@rtc/core-api";
import { ACCOUNT_LIST_LOADING, foldAccountList } from "@rtc/core-logic";
import type { AccountAdminPort, AccountListOutcome } from "@rtc/domain";

const UNAVAILABLE: AccountListOutcome = { ok: false, reason: "unavailable" };

/** Implements `AccountListPresenter` (`@rtc/core-api`) — see the interface
 * for the contract. Keyed on the signed-in user (`userKey$`, the email or
 * null): a null or changed key resets to `ACCOUNT_LIST_LOADING` with no rows
 * and cancels a load in flight, then loads at once if a subscriber is
 * attached, else on the next first subscription. For one user the state is
 * warm: unsubscribing everyone and subscribing again does not reload. */
export class AccountListPresenter implements AccountListPresenterApi {
  readonly state$: StateObservable<AccountListState>;

  readonly admin: AccountAdminPort;

  private readonly subject = new BehaviorSubject<AccountListState>(
    ACCOUNT_LIST_LOADING,
  );

  private readonly port: AccountAdminPort;

  private key: string | null = null;

  private loadStarted = false;

  private attached = 0;

  private disposed = false;

  private load: Subscription | null = null;

  constructor(
    port: AccountAdminPort,
    userKey$: Observable<string | null>,
    disposed$: Observable<unknown>,
  ) {
    this.port = port;
    this.admin = port;
    const keys = userKey$
      .pipe(distinctUntilChanged())
      .subscribe((key: string | null): void => {
        this.useKey(key);
      });
    disposed$.pipe(take(1)).subscribe((): void => {
      this.dispose(keys);
    });
    this.state$ = state(
      new Observable<AccountListState>((subscriber) => {
        this.attached += 1;
        this.startFirstLoad();
        const inner = this.subject.subscribe(subscriber);

        return (): void => {
          this.attached -= 1;
          inner.unsubscribe();
        };
      }),
      ACCOUNT_LIST_LOADING,
    );
  }

  refresh(): void {
    if (this.disposed || this.key === null || !this.loadStarted) {
      return;
    }

    this.startLoad();
  }

  private useKey(key: string | null): void {
    this.key = key;
    this.loadStarted = false;
    this.cancelLoad();

    if (this.subject.value !== ACCOUNT_LIST_LOADING) {
      this.subject.next(ACCOUNT_LIST_LOADING);
    }

    if (this.attached > 0) {
      this.startFirstLoad();
    }
  }

  private startFirstLoad(): void {
    if (!this.disposed && this.key !== null && !this.loadStarted) {
      this.startLoad();
    }
  }

  private startLoad(): void {
    this.loadStarted = true;
    this.cancelLoad();

    if (this.subject.value.status !== "loading") {
      this.subject.next({ ...this.subject.value, status: "loading" });
    }

    this.load = defer(() => {
      return this.port.listAccounts();
    })
      .pipe(
        catchError((): Observable<AccountListOutcome> => {
          return of(UNAVAILABLE);
        }),
      )
      .subscribe((outcome: AccountListOutcome): void => {
        this.subject.next(foldAccountList(outcome, this.subject.value));
      });
  }

  private cancelLoad(): void {
    this.load?.unsubscribe();
    this.load = null;
  }

  private dispose(keys: Subscription): void {
    this.disposed = true;
    keys.unsubscribe();
    this.cancelLoad();
    this.subject.complete();
  }
}
