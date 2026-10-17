import { useEffect, useEffectEvent, useRef } from "react";

import type {
  AccountAccessIntents,
  AccountAccessState,
  AccountNavigation,
} from "@rtc/core-api";
import { type AccountRouteSync, createAccountRouteSync } from "@rtc/core-logic";
import { useViewModel } from "@rtc/react-bindings";

type AccountRoutesSource = Pick<AccountAccessIntents, AccountNavigation> & {
  readonly state: AccountAccessState;
};

/** Keeps the page's route in step with the login screen (spec §6) and
 * returns the links' navigation: a new history entry, then the intent. A
 * host with no route history gets the bare intents.
 *
 * The four navigation intents must keep their identity across renders: a
 * changed identity rebuilds the sync, which re-runs its mount rule against
 * the current route. Every real host meets this — they are `useMachine`'s
 * intents, stable for the machine's life. */
export function useAccountRoutes(
  account: AccountRoutesSource,
  registrationAvailable: boolean,
): (navigation: AccountNavigation) => void {
  const { useRouteHistory } = useViewModel();
  const routes = useRouteHistory();
  const syncRef = useRef<AccountRouteSync | null>(null);
  const {
    state,
    returnToSignIn,
    startRegistration,
    startReset,
    startCodeEntry,
  } = account;

  const observeCurrentState = useEffectEvent((sync: AccountRouteSync): void => {
    sync.observe(state);
  });

  useEffect(() => {
    if (routes === null) {
      return undefined;
    }

    const sync = createAccountRouteSync({
      routes,
      intents: {
        returnToSignIn,
        startRegistration,
        startReset,
        startCodeEntry,
      },
      registrationAvailable,
    });
    syncRef.current = sync;
    observeCurrentState(sync);

    return () => {
      sync.dispose();
      syncRef.current = null;
    };
  }, [
    routes,
    registrationAvailable,
    returnToSignIn,
    startRegistration,
    startReset,
    startCodeEntry,
  ]);

  useEffect(() => {
    syncRef.current?.observe(state);
  }, [state]);

  return (navigation: AccountNavigation): void => {
    if (syncRef.current === null) {
      account[navigation]();
      return;
    }

    syncRef.current.navigate(navigation);
  };
}
