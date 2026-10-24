import { Cause, Effect, Scope } from "effect";

import type {
  AccountListPresenter,
  AccountListState,
  AuthViewState,
  Stream,
} from "@rtc/core-api";
import { ACCOUNT_LIST_LOADING, foldAccountList } from "@rtc/core-logic";
import type { AccountAdminPort, AccountListOutcome } from "@rtc/domain";

import {
  createChildHost,
  type EffectHost,
  listenToStateStream,
  listenToStream,
  reportOutOfBand,
} from "#/bridge/out";
import { rpc } from "#/bridge/rpc";
import { createSyncRef } from "#/bridge/syncRef";
import { createRunSlot, type Run } from "#/machines/runSlot";

const UNAVAILABLE: AccountListOutcome = { ok: false, reason: "unavailable" };

/** The administrator's account list on a `SyncRef` and a run slot, in a child
 * of the app host's scope — the RxJS `AccountListPresenter`'s rules. Keyed
 * on the signed-in user's email (null when signed out), heard synchronously
 * from the auth state: a null or changed key resets to
 * `ACCOUNT_LIST_LOADING` with no rows and ends a load in flight, then loads
 * at once if a subscriber is attached, else on the next first subscription.
 * For one user the state is warm: unsubscribing everyone and subscribing
 * again does not reload. A failing port reads as `unavailable`. A load is
 * one `rpc` fiber, so ending the run unsubscribes the port. */
export function createAccountListPresenter(
  parent: EffectHost,
  port: AccountAdminPort,
  authState$: Stream<AuthViewState>,
): AccountListPresenter {
  const host = createChildHost(parent);
  const ref = createSyncRef<AccountListState>(ACCOUNT_LIST_LOADING);
  const slot = createRunSlot(host, ref);
  let key: string | null = null;
  let seenKey = false;
  let loadStarted = false;
  let attached = 0;

  function startLoad(): void {
    loadStarted = true;

    if (ref.get().status !== "loading") {
      ref.set((state) => {
        return { ...state, status: "loading" };
      });
    }

    slot.start((run: Run<AccountListState>) => {
      return Effect.suspend(() => {
        return rpc(port.listAccounts());
      }).pipe(
        Effect.catchAll(() => {
          return Effect.succeed(UNAVAILABLE);
        }),
        Effect.flatMap((outcome: AccountListOutcome) => {
          return run.write((state) => {
            return foldAccountList(outcome, state);
          });
        }),
      );
    });
  }

  function startFirstLoad(): void {
    if (!slot.isDisposed() && key !== null && !loadStarted) {
      startLoad();
    }
  }

  function resetForKey(next: string | null): void {
    key = next;
    loadStarted = false;
    slot.end();
    ref.set(() => {
      return ACCOUNT_LIST_LOADING;
    });

    if (attached > 0) {
      startFirstLoad();
    }
  }

  const stopListening = listenToStream(
    authState$,
    (auth: AuthViewState) => {
      const next = auth.user?.email ?? null;

      if (seenKey && next === key) {
        return;
      }

      seenKey = true;
      resetForKey(next);
    },
    (error: unknown) => {
      reportOutOfBand(Cause.die(error));
    },
  );

  host.runtime.runSync(
    Scope.addFinalizer(
      host.scope,
      Effect.sync(() => {
        stopListening();
        slot.dispose();
      }),
    ),
  );

  return {
    state$: listenToStateStream(
      (listener: (value: AccountListState) => void) => {
        attached += 1;
        startFirstLoad();
        const release = ref.listen(listener);

        return () => {
          attached -= 1;
          release();
        };
      },
      ref.get,
    ),
    refresh: (): void => {
      if (slot.isDisposed() || key === null || !loadStarted) {
        return;
      }

      startLoad();
    },
    admin: port,
  };
}
