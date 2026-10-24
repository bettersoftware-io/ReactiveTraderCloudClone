import type {
  AccountListPresenter,
  AccountListState,
  AuthViewState,
  Stream,
} from "@rtc/core-api";
import { ACCOUNT_LIST_LOADING, foldAccountList } from "@rtc/core-logic";
import type { AccountAdminPort, AccountListOutcome } from "@rtc/domain";

import { once, relay } from "#/bridge/in";
import { storeToStateStream } from "#/bridge/out";
import { reportAsync } from "#/kernel/reportAsync";
import { createRunSlot } from "#/kernel/runSlot";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";

const UNAVAILABLE: AccountListOutcome = { ok: false, reason: "unavailable" };

/** The administrator's account list on a Store and a run slot — the RxJS
 * `AccountListPresenter`'s rules. Keyed on the signed-in user's email (null
 * when signed out): a null or changed key resets to `ACCOUNT_LIST_LOADING`
 * with no rows and ends a load in flight, then loads at once if a subscriber
 * is attached, else on the next first subscription. For one user the state
 * is warm: unsubscribing everyone and subscribing again does not reload. A
 * failing port reads as `unavailable`. */
export function createAccountListPresenter(
  port: AccountAdminPort,
  authState$: Stream<AuthViewState>,
  lifetime: AbortSignal,
): AccountListPresenter {
  const store = createStore<AccountListState>(ACCOUNT_LIST_LOADING);
  const slot = createRunSlot(store);
  let key: string | null = null;
  let seenKey = false;
  let loadStarted = false;
  let attached = 0;

  function startLoad(): void {
    loadStarted = true;

    if (store.get().status !== "loading") {
      store.set((state) => {
        return { ...state, status: "loading" };
      });
    }

    slot.start(async (run) => {
      let outcome: AccountListOutcome;

      try {
        outcome = await once(port.listAccounts(), run.signal);
      } catch {
        outcome = UNAVAILABLE;
      }

      run.set((state) => {
        return foldAccountList(outcome, state);
      });
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
    store.set(ACCOUNT_LIST_LOADING);

    if (attached > 0) {
      startFirstLoad();
    }
  }

  lifetime.addEventListener(
    "abort",
    () => {
      slot.dispose();
    },
    { once: true },
  );

  void spawn(() => {
    return relay(authState$, lifetime, (auth) => {
      const next = auth.user?.email ?? null;

      if (seenKey && next === key) {
        return;
      }

      seenKey = true;
      resetForKey(next);
    });
  }, reportAsync);

  return {
    state$: storeToStateStream(
      store,
      () => {
        attached += 1;
        startFirstLoad();
      },
      () => {
        attached -= 1;
      },
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
