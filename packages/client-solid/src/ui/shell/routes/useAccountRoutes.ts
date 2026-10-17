import { type Accessor, createEffect, onCleanup } from "solid-js";

import type {
  AccountAccessIntents,
  AccountAccessState,
  AccountNavigation,
} from "@rtc/core-api";
import { createAccountRouteSync } from "@rtc/core-logic";
import { useViewModel } from "@rtc/solid-bindings";

type AccountRoutesSource = Pick<AccountAccessIntents, AccountNavigation> & {
  readonly state: Accessor<AccountAccessState>;
};

/** Keeps the page's hash route in step with the login screen (spec §6) and
 * returns the links' navigation: a new history entry, then the intent. A
 * host with no route history gets the bare intents. Runs once per mount,
 * like every Solid component body. */
export function useAccountRoutes(
  account: AccountRoutesSource,
  registrationAvailable: boolean,
): (navigation: AccountNavigation) => void {
  const { useRouteHistory } = useViewModel();
  const routes = useRouteHistory();

  if (routes === null) {
    return (navigation: AccountNavigation): void => {
      account[navigation]();
    };
  }

  const sync = createAccountRouteSync({
    routes,
    intents: account,
    registrationAvailable,
  });

  createEffect(() => {
    sync.observe(account.state());
  });
  onCleanup(() => {
    sync.dispose();
  });

  return (navigation: AccountNavigation): void => {
    sync.navigate(navigation);
  };
}
